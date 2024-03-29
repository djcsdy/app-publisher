
import * as path from "path";
import regexes from "../definitions/regexes";
import { IChangelogEntry, IContext } from "../../interface";
import { createDir, deleteFile, pathExists, readFile, writeFile } from "../utils/fs";
import { editFile, properCase } from "../utils/utils";
import { Changelog } from "./changelog";
const execa = require("execa");
const os = require("os"), EOL = os.EOL;


export class ChangelogMd extends Changelog
{

    createSectionFromCommits(context: IContext)
    {
        let tmpCommits = "",
            lastSubject = "";
        const sectionless: string[] = [],
              { options, commits, logger } = context;

        if (!commits || commits.length === 0) {
            logger.warn("Cannot build changelog section, there are no commits");
            return tmpCommits;
        }

        logger.log(`Build changelog file section from ${commits.length} commits`);

        const formatCommitPart = (subject: string, scope: string, commitMsg: string): string =>
        {
            let fmtCommitMsg = "- ";

            if (!subject) {
                return fmtCommitMsg + commitMsg;
            }

            subject = subject.toLowerCase().trim();
            scope = scope ? properCase(scope.toLowerCase().trim()) : undefined;

            //
            // Ignore chores, progress, and custom specified subjects to ignore
            //
            if (this.isSkippedCommitMessage(`${subject}: `)) {
                return "";
            }

            let doContinue = false;
            if (options.commitMsgMap)
            {
                for (const map of options.commitMsgMap)
                {
                    if (subject.toLowerCase() === map.type && !map.include) {
                        doContinue = true;
                    }
                }
            }
            if (doContinue) {
                return "";
            }

            //
            // Start the comment list item, add scope in bold if necessary
            //
            if (scope) {
                fmtCommitMsg += `**${scope}:** `;
            }

            //
            // For multi-line comments, do some special processing
            //
            if (commitMsg.includes(EOL))
            {
                const tmpCommitParts = commitMsg.split(EOL);
                fmtCommitMsg += tmpCommitParts[0];
                for (let i = 1; i < tmpCommitParts.length; i++)
                {
                    // if (!tmpCommitParts[i]) { // remove double line breaks
                    //     continue;
                    // }
                    fmtCommitMsg += EOL;
                    if (/^ {2,}/.test(tmpCommitParts[i]) || tmpCommitParts[i].startsWith("\t")) {
                        fmtCommitMsg += "\t";
                    }
                    fmtCommitMsg += `\t${tmpCommitParts[i].trim()}`;
                }
                fmtCommitMsg += EOL;
            }
            else {
                fmtCommitMsg += `${commitMsg}${EOL}`;
            }
            //
            // Record last subject, we only print the subject when it differs from previous
            //

            //
            // Print out the subject as a title if it is different than the previous sections
            // title.  Comments are alphabetized.
            //
            if (subject !== lastSubject) {
                const tmpSection = this.getFormattedSubject(context, subject, true);
                fmtCommitMsg = `${EOL}### ${tmpSection}${EOL}${EOL}${fmtCommitMsg}`;
            }
            lastSubject = subject;
            return this.cleanMessage(fmtCommitMsg);
        };

        //
        // Loop through the commits and build the markdown for appending to the changelog
        //
        for (const commit of commits)
        {
            if (!commit || !commit.messageBody) {
                continue;
            }
            tmpCommits += formatCommitPart(commit.subject, commit.scope, commit.messageBody);
        }

        //
        // Add any commits that did not contain a conventional commit subject
        //
        if (sectionless.length > 0)
        {
            tmpCommits += `${EOL}### Other Notes${EOL}${EOL}`;
            for (const commit of sectionless)
            {
                tmpCommits += `- ${commit}${EOL}`;
            }
        }

        //
        // TODO
        //
        // Perform spell checking (currently the projectoxford has been taken down after the
        // Microsoft deal with the facial rec api)
        //
        // tmpCommits = CheckSpelling tmpCommits false
        //
        // Write the formatted commits text to the top of options.changelogFile, but underneath the
        // changelog title
        //

        return tmpCommits.trim();
    }


    /**
     * Gets an array returning the commit types
     *
     * @since 3.0.0
     * @param changeLog HTML formatted changeog / history file section
     * @returns Array of commit subjects in order of the commits list
     */
    private getSubjectsFromHtml(changeLog: string): string[]
    {
        const changelogTypes = [],
            regex = new RegExp(/\w*(?<=### ).+?(?=(<br>-))/gm);
        let match: RegExpExecArray;
        while ((match = regex.exec(changeLog)) !== null)
        {
            let section = match[0];
            //
            // Trim plurality
            //
            if (section.endsWith("es<br>") && section !== "Features<br>") {
                section = section.substring(0, section.length - 6);
            }
            else if (section.endsWith("s<br>") && section !== "Miscellaneous<br>") {
                section = section.substring(0, section.length - 5);
            }
            //
            // count the messages for each section and add the subjects to the types array
            //
            let match2: RegExpExecArray;
            const regex = new RegExp(`\\w*(?<=${section}).+?(?=(<br>###|$))`, "gm");
            while ((match2 = regex.exec(changeLog)) !== null)
            {
                let i1 = match2[0].indexOf("<br>- ");
                while (i1 !== -1) {
                    changelogTypes.push(section.replace("<br>", "").trim());
                    i1 = match2[0].indexOf("<br>- ", i1 + 1);
                }
            }
        }

        return changelogTypes;
    }


    async doEdit(context: IContext)
    {
        let newChangelog = false;
        const { options, logger, lastRelease, nextRelease } = context,
              originalFile = options.changelogFile,
              taskSpecVersion = options.taskChangelogPrintVersion || options.taskChangelogViewVersion || options.taskChangelogHtmlPrintVersion,
              version = !taskSpecVersion ? nextRelease.version : taskSpecVersion;

        logger.log("Start changelog file edit");

        if (!options.taskChangelogPrint && !options.taskChangelogPrintVersion && !options.taskChangelogHtmlPrint && !options.taskChangelogHtmlPrintVersion)
        {
            if (options.taskChangelogFile || options.taskChangelogHtmlFile)
            {
                options.changelogFile = options.taskChangelogFile || options.taskChangelogHtmlFile;
                if (await pathExists(options.changelogFile))
                {
                    await deleteFile(options.changelogFile);
                }
            }
            else if (options.taskMode && !options.taskChangelog)
            {
                options.changelogFile = path.join(os.tmpdir(), `changelog.${version}.md`);
                if (await pathExists(options.changelogFile))
                {
                    await deleteFile(options.changelogFile);
                }
            }

            const changeLogPath = path.dirname(options.changelogFile);

            if (changeLogPath !== "" && !(await pathExists(changeLogPath)))
            {
                logger.log("Create changeLog file directory");
                await createDir(changeLogPath);
            }
            if (!(await pathExists(options.changelogFile)))
            {
                logger.log("Create new changelog md file");
                await writeFile(options.changelogFile, "");
                newChangelog = true;
            }
        }

        if (lastRelease.version !== nextRelease.version || newChangelog || options.taskMode)
        {
            const changelogTitle = `# ${options.projectName} Change Log`.toUpperCase();

            let tmpCommits: string,
                changeLogFinal = "";

            if (taskSpecVersion) {
                tmpCommits = await this.getSections(context, version, 1, false, originalFile);
            }
            else if (!options.taskChangelogHtmlView && !options.taskChangelogHtmlFile) {
                tmpCommits = context.changelog.notes || this.createSectionFromCommits(context);
            }       //
            else { // HTML
                  //
                if (context.changelog.htmlNotes) {
                    tmpCommits = context.changelog.htmlNotes;
                }
                else { //
                      // Check 'next' version, on a full publish w/ changelog already written, so that
                     // the notes are formatted by user (non-ci)
                    //
                    let entries = await this.getSectionEntries(context, version);
                    if (entries && entries.length > 0) {
                        tmpCommits = await this.createHtmlChangelog(context, entries, options.mantisbtRelease === "Y");
                    }     //
                    else // Get the section from the commits, these are unformatted by user
                    {   //
                        logger.log("Generate dynamic section for HTML changelog generation");
                        tmpCommits = await this.getHeader(context, version) + // add the header since getPartsFromSection() expects it
                                        EOL + (context.changelog.notes || this.createSectionFromCommits(context));
                        entries = await this.getSectionEntries(context, tmpCommits, true);
                        if (entries && entries.length > 0) {
                            tmpCommits = await this.createHtmlChangelog(context, entries, options.mantisbtRelease === "Y");
                        }
                    }
              }
            }
            if (!tmpCommits || tmpCommits.trim() === "") {
                tmpCommits = "- No relevant changes.";
            }

            if (options.taskChangelogPrint || options.taskChangelogPrintVersion)
            {
                context.stdout.write(tmpCommits);
                return;
            }
            else if (options.taskChangelogHtmlPrint || options.taskChangelogHtmlPrintVersion)
            {
                if (tmpCommits !== "- No relevant changes.")
                {
                    if (context.changelog.htmlNotes) {
                        tmpCommits = context.changelog.htmlNotes;
                    }
                    else {
                        if (options.taskChangelogHtmlPrintVersion) {
                            const entries = await this.getSectionEntries(context, version);
                            if (entries && entries.length > 0) {
                                tmpCommits = await this.createHtmlChangelog(context, entries, true);
                            }
                        }
                        else {
                            tmpCommits = await this.getHeader(context, version) + // add the header since getPartsFromSection() expects it
                                               EOL + (context.changelog.notes || this.createSectionFromCommits(context));
                            const entries = await this.getSectionEntries(context, tmpCommits, true);
                            if (entries && entries.length > 0) {
                                tmpCommits = await this.createHtmlChangelog(context, entries, true);
                            }
                        }
                    }
                }
                context.stdout.write(tmpCommits);
                return;
            }

            //
            // Main edit.  For full run or --task-changelog
            //
            if (options.taskChangelog || !options.taskMode)
            {
                if (!newChangelog && !tmpCommits.endsWith(EOL)) {
                    tmpCommits += EOL;
                }

                //
                // Check to see if this is a production version, and if there are pre-release sections
                // for this version, remove them, removePreReleaseSections() will only remove under the
                // case where the lastRelease.version is a pre-release, and next Release.version is not
                //
                await this.removePreReleaseSections(context, version, regexes.CHANGELOG_MD_VERSION_SECTION(options.versionText));

                const header = await this.getHeader(context, version);
                tmpCommits = `${header}${EOL}${EOL}${tmpCommits}`.trimRight();

                let changeLogContents = await readFile(options.changelogFile);
                changeLogContents = changeLogContents.replace(new RegExp(changelogTitle, "i"), "").trim();

                changeLogFinal = `${changelogTitle}${EOL}${EOL}`;
                if (tmpCommits) {
                    changeLogFinal = `${changeLogFinal}${tmpCommits}${EOL}${EOL}`;
                }
                if (changeLogContents) {
                    changeLogFinal = `${changeLogFinal}${changeLogContents}${EOL}`;
                }
            }
            //
            // Task edit, or view. or print / non-main edit
            //
            else {
                if (!options.taskChangelogFile && !options.taskChangelogHtmlFile && !options.taskChangelogHtmlView)
                {   //
                    // Write title
                    //
                    changeLogFinal += `${EOL}${!taskSpecVersion ? "Pending " : ""}${options.versionText} ${version} Changelog:${EOL}${EOL}${EOL}`;
                }
                changeLogFinal += tmpCommits;
            }

            changeLogFinal = changeLogFinal.trimRight() + EOL;
            await writeFile(options.changelogFile, changeLogFinal);
        }
        else {
            logger.warn("Version match, not touching changelog file");
        }

        //
        // Allow manual modifications to history file
        //
        await editFile(context, options.changelogFile, true);

        //
        // Reset
        //
        options.changelogFile = originalFile;
    }


    async getHeader(context: IContext, version?: string)
    {
        let header = "", hdrFinal = "", titleVersion = version;
        const {options} = context,
              fmtDate = this.getFormattedDate();
        if (!version) {
            version = context.nextRelease.version;
        }
        if (options.vcWebPath) {
            titleVersion = version;
            //
            // TODO - links in changelog (but not in title, or redo version parser)
            //
            // titleVersion = options.repoType === "git" ?
            //                     `[${nextRelease.version}](${options.vcWebPath}/compare/v${lastRelease.version}...v${nextRelease.version})` :
            //                     nextRelease.version;
        }
        if (await pathExists(options.changelogHdrFile)) {
            header = await readFile(options.changelogHdrFile);
        }
        hdrFinal = `## ${options.versionText} ${titleVersion} (${fmtDate})`;
        if (header) {
            hdrFinal = hdrFinal + EOL + EOL + header;
        }
        return hdrFinal;
    }


    async getSectionEntries(context: IContext, version?: string, versionIsContent = false): Promise<IChangelogEntry[] | undefined>
    {
        const { logger } = context;

        logger.log("Extracting change entries from changelog txt file section");

        let contents = !versionIsContent ? await this.getSections(context, version, 1, false) : version;
        if (!contents) {
            logger.warn("   Content is empty, no change entries to extract");
            return undefined;
        }

        const typeParts = [],
                msgParts = [],
                entries: IChangelogEntry[] = [];
        //
        // Replace line feeds with html line breaks
        //
        contents = contents.replace(/\r\n/gm, "<br>");
        contents = contents.replace(/\n/gm, "<br>");
        contents = contents.replace(/\t/gm, "&nbsp;&nbsp;&nbsp;&nbsp;");

        //
        // The getChangelogSubjectsFromHtml() method returns a list of types for each note in the section.
        //
        // For example:
        //
        //     ### Features
        //
        //     - feature 1
        //     - **scope1:** feature 2
        //
        //     ### Bug Fixes
        //
        //     - bug fix 1
        //
        // Will return a list like:
        //
        //    [ "Features", "Features", "Bug Fixes" ]
        //
        typeParts.push(...this.getSubjectsFromHtml(contents));
        if (typeParts.length === 0) {
            logger.warn("   Changelog md parts could not be found in section");
            return entries;
        }

        //
        // Get the 'msgParts', this will be the matching commit messages to the types list
        // extracted above.
        //
        let match: RegExpExecArray;
        const regex = new RegExp(/\w*(?<=^|>)(- ){1}.+?(?=(<br>-|<br>##|$))/g);
        while ((match = regex.exec(contents)) !== null)
        {
            let value = match[0].substring(2);
            value = value.replace("<br>&nbsp;&nbsp;&nbsp;&nbsp;[", "<br>["); // ticket tags
            if (value.startsWith("<br>")) {
                value = value.substring(4);
            }
            if (value.endsWith("<br>")) {
                value = value.substring(0, value.length - 4);
            }
            msgParts.push(value.trim());
        }

        if (msgParts.length !== typeParts.length) {
            logger.error("Error parsing changelog for commit parts");
            logger.error(`Message array length ${msgParts.length} != types array length ${typeParts.length}`);
            throw new Error("167");
        }

        for (let i = 0; i < typeParts.length; i++)
        {
            let scope = "",
                tickets = "",
                message = msgParts[i];
            const subject = typeParts[i];
            //
            // Extract scope
            //
            if (/^(\*\*.+\:\*\* )/.test(msgParts[i])) {
                scope = msgParts[i].substring(0, msgParts[i].indexOf(":**")).replace("**", "").trim();
            }
            //
            // Extract message and ticket tags
            //
            const regex = new RegExp(regexes.ISSUES);
            while ((match = regex.exec(msgParts[i])) !== null)
            {
                tickets = match[1].trim();
                tickets = properCase(tickets.replace(/&nbsp;/g, " ")).trim();
                message = message.replace(new RegExp("/<br><br>" + match[0], "g"), "")
                                .replace(new RegExp("<br>" + match[0], "g"), "")
                                .replace(new RegExp("&nbsp;&nbsp;&nbsp;&nbsp;" + match[0], "g"), "")
                                .replace(new RegExp("&nbsp;&nbsp;&nbsp;" + match[0], "g"), "")
                                .replace(new RegExp("&nbsp;&nbsp;" + match[0], "g"), "")
                                .replace(new RegExp("&nbsp;" + match[0], "g"), "")
                                .replace(new RegExp(" " + match[0], "g"), "")
                                .replace(new RegExp(match[0], "g"), "").trim();
            }
            if (scope) {
                message = message.replace(`**${scope}:**`, "");
                while (message[0] === " ") {
                    message = message.substring(1);
                }
            }
            entries.push({ subject, scope, message: this.getHtmlFormattedMessage(message, true), tickets });
        }

        logger.log("Successfully retrieved changelog file section parts");
        return entries;
    }


    /**
     * Gets changelog file section using the hostory/changelog file by parsing the specified
     * versions section.
     *
     * @param context The run context object.
     * @param version The version to extract the notes from in the history/changelog file.
     * @param numSections # of section to extract
     * @param listOnly retrieve an array of strings only, not a formatted string
     * @returns HTML version of the requested changelog section(s)
     */
    async getSections(context: IContext, version?: string, numSections = 1, htmlFormat = true, inputFile?: string): Promise<string>
    {
        const { options, logger } = context;
        if (!inputFile) {
            inputFile = options.changelogFile;
        }
        //
        // Make sure user entered correct cmd line params
        //
        if (!inputFile) {
            logger.error("Error: No changelog file specified");
            throw new Error("160");
        }

        if (!(await pathExists(inputFile))) {
            logger.warn("Changelog md file does not exist");
            return "";
        }

        logger.log(`Extract changelog section from '${inputFile}'`);
        logger.log(`   Num sections       : '${numSections}'`);
        logger.log(`   Version start      : '${version ?? "n/a"}'`);
        logger.log(`   Version string     : '${options.versionText}'`);
        logger.log(`   HTML format        : '${htmlFormat}'`);
        logger.log(`   Input file         : '${inputFile}'`);

        //
        // Code operation:
        //
        // Open the file
        //
        // Find the following string structure for the last entry:
        //
        //    ## Version 1.5.14 (June 27th, 2019)
        //
        //    ### Subject line....
        //
        //    - commit message 1
        //    - commit message 2
        //
        //    ### Subject 2 line...
        //
        //    - commit message 3
        //

        //
        // Extract the specified version entry, which in changelog convention should be at top of file
        //

        //
        // Read in contents of file
        //
        let contents = await readFile(inputFile);

        //
        // If 'version' is empty, then this is a request for the latest version #.  Return version and exit
        //
        if (!version)
        {
            let idx1 = contents.indexOf(`## ${options.versionText} `),
                curVersion: string;
            if (idx1 !== -1) {
                idx1 += (options.versionText.length + 4);
                const idx2 = contents.indexOf("\n", idx1);
                if (idx2 !== -1) {
                    curVersion = contents.substring(idx1, idx2).trim().replace(/ \(.+\)/, (s) => { return ""; });
                }
            }
            if (curVersion) {
                logger.log(`   Version request - found latest version ${curVersion}`);
            }
            else {
                logger.log("   Version request - not found");
            }
            return curVersion;
        }

        //
        // Initialize parsing variables
        //
        let index1 = 0, index2 = 0;

        index1 = contents.indexOf(`## ${options.versionText} ${version}`);
        if (index1 === -1) {
            index1 = contents.indexOf(`## ${options.versionText} [${version}`);
            if (index1 === -1) {
                logger.warn("Changelog section could not be found");
                return "";
            }
        }

        //
        // TODO - support extracting more than one section, specified by 'numSections'
        //
        index2 = contents.indexOf(`## ${options.versionText} `, index1 + 1);
        if (index2 === -1) {
            index2 = contents.length;
        }

        logger.log("Found version section(s)");

        contents = contents.substring(index1, index2);

        //
        // TODO
        // Add changelinks to changelog entries
        // Ex: https://github.com/spmeesseman/vscode-taskexplorer/compare/v2.2.0...v2.3.0
        //

        //
        // TODO
        // Add issue links
        // Ex: ([ce9c8f0](https://github.com/spmeesseman/vscode-taskexplorer/commit/ce9c8f0))
        //

        if (!htmlFormat)
        {
            logger.log("Successfully retrieved raw changelog file content");
            return contents;
        }

        //
        // Convert to html
        //
        const clFile = path.join(os.tmpdir(), "CHANGELOG.md");
        contents = contents.replace(EOL, "\n");
        await writeFile(clFile, contents);
        contents = await execa.stdout("marked", ["--breaks", "--gfm", "--file", clFile]);
        await deleteFile(clFile);

        logger.log("Successfully retrieved changelog file content");

        return contents;
    }


    /**
     * Gets version number from the last entered section of the changelog / history file.
     *
     * @since 3.0.0
     * @param context The run context object.
     * @returns The version number of the last section found in the history / changelog file.
     */
    async getVersion(context: IContext)
    {
        context.logger.log("Retrieve last version number from changelog file");
        return this.getSections(context);
    }

}
