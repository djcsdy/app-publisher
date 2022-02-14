
import * as path from "path";
import { publishRcOpts } from "../args";
import { escapeShellString, isNumeric, isObject, isString, validateVersion } from "./utils/utils";
import { createDir, pathExists } from "./utils/fs";
import { IContext, IOptions, IVersionFile } from "../interface";

export = validateOptions;


async function validateOptions({cwd, env, logger, options}: IContext, suppressArgErrors?: boolean): Promise<boolean>
{
    logger.log("Validating all options...");

    if (options.errors && options.errors.length > 0)
    {
        if (!suppressArgErrors) { // Suppress if this is a check from the tests
            logger.error("Argument parser reported validation errors:");
            for (const e of options.errors) {
                logger.error("   " + e.toString());
            }
        }
        return false;
    }

    //
    // First and foremost make sure the cosmic config parser found the config file
    //
    if (!options.configFilePath)
    {
        logger.error("No config file found");
        logger.error("A config file must exist at the root of the project:");
        logger.error("   .publishrc.json/js/yml/yaml");
        logger.error("Or if using the --config-name command line option:");
        logger.error("   .publishrc.CONFIGNAME.json/js/yml/yaml");
        return false;
    }

    //
    // Project name must be set
    //
    if (!options.projectName)
    {
        logger.error("Invalid project name, or not defined");
        logger.error("Configure 'projectName' in .publishrc");
        return false;
    }

    //
    // Convert array params to arrays, if specified as string on cmdline or publishrc
    //
    convertStringsToArrays(options);

    //
    // Check script syntax
    //
    if (!checkScriptsSyntax(options, logger)) {
        return false;
    }

    //
    // FLAGS - Verify Y/N, set to default value on empty
    //
    if (!checkOptionsTypes(options, logger)) {
        return false;
    }

    //
    // Loop through all possible arguments, and set efault values if they don't
    // already exist on the options object
    //
    for (const o in publishRcOpts)
    {   //
        // TODO - techincally w=all defaults should be set here if theres a defined
        // default value and the property is not on the options object.  In lieu of
        // creating side effect bugs from this change, leaving it to just flags for now
        //
        if (publishRcOpts[o][1] === "flag" && !options[o]) {
            options[o] = publishRcOpts[o][2];
        }
    }

    if (!checkVersionFiles(options, logger)) {
        return false;
    }

    //
    // Email configuration
    //
    if (!checkEmailConfiguration(options, logger)) {
        return false;
    }

    //
    // Set up log file
    //
    if (options.writeLog === "Y")
    {   //
        // Define log folder name
        //
        const logFolder = path.join(env.LOCALAPPDATA, "app-publisher", "log");
        //
        // Define log file name
        //
        // const date = Get-Date -format "yyyyMMddHHmmss";
        // const logFile = path.join(logFolder, "app-publisher-CurrentDate.log");
        //
        // Create the log directory
        //
        if (!(await pathExists(logFolder))) {
            await createDir(logFolder);
        }
    }

    //
    // Set repository and repository type
    //
    if (!options.repoType) {
        logger.error("Repository type must be specified on cmd line, package.json or publishrc");
        return false;
    }
    else if (options.repoType !== "git" && options.repoType !== "svn")
    {
        logger.error("Invalid repository type, must be 'git' or 'svn'");
        return false;
    }

    //
    // Branch
    //
    if (options.branch.startsWith("/")) {
        options.branch = options.branch.substring(1);
    }

    //
    // SVN repo path
    //
    setSvn(options);

    //
    // If specified editor doesnt exist, then switch to notepad or pico
    //
    await setEditor(options, logger, env);

    //
    // NPM
    //
    if (!checkNpm(options, logger)) {
        return false;
    }

    //
    // Dist Release
    //
    if (options.taskDistRelease) {
        options.distRelease = "Y";
    }
    //
    // Check dist release path for dist release
    //
    if (options.distRelease === "Y" && !options.distReleasePathSrc) {
        logger.error("distReleasePathSrc must be specified for dist release");
        return false;
    }

    //
    // Github Release
    //
    if (options.taskGithubRelease) {
        options.githubRelease = "Y";
    }
    if (options.githubRelease === "Y") {
        if (!options.githubUser) {
            logger.error("You must specify githubUser for a GitHub release type");
            return false;
        }
        if (!env.GITHUB_TOKEN) {
            logger.error("You must have GITHUB_TOKEN defined in the environment for a GitHub release type");
            logger.error("Set the environment variable GITHUB_TOKEN using the token value created on the GitHub website");
            return false;
        }
    }

    //
    // Mantis Release
    //
    if (options.taskMantisbtRelease) {
        options.mantisbtRelease = "Y";
    }
    if (options.mantisbtRelease === "Y")
    {
        if (!options.mantisbtUrl) {
            logger.error("You must specify mantisbtUrl for a MantisBT release type");
            return false;
        }
        if (!options.mantisbtApiToken) {
            logger.error("You must have MANTISBT_API_TOKEN defined for a MantisBT release type");
            logger.error("-or- you must have mantisbtApiToken defined in publishrc");
            logger.error("Set the env var MANTISBT_API_TOKEN or the config mantisApiToken with the token value created on the MantisBT website");
            logger.error("To create a token, see the \"Tokens\" section of your Mantis User Preferences page");
            return false;
        }
    }
    //
    // Mantis Plugin
    //
    if (options.mantisbtPlugin)
    {
        if (!options.mantisbtPlugin.includes((".php"))) {
            logger.error("Invalid value for mantisbtPlugin, file must have a php extension");
            return false;
        }
        if (!(await pathExists(options.mantisbtPlugin))) {
            logger.error("Invalid value for mantisbtPlugin, non-existent file specified");
            return false;
        }
    }

    //
    // Paths
    //
    if (options.changelogHdrFile) {
        if (!(await pathExists(options.changelogHdrFile))) {
            logger.error("Invalid value for changelogHdrFile, non-existent file specified");
            return false;
        }
    }

    //
    // C Projects
    //
    if (options.cProjectRcFile) {
        if (!options.cProjectRcFile.toLowerCase().includes((".rc"))) {
            logger.error("Invalid value for cProjectRcFile, file must have an rc extension");
            return false;
        }
        if (!(await pathExists(options.cProjectRcFile))) {
            logger.error("Invalid value for cProjectRcFile, non-existent file specified");
            return false;
        }
    }

    //
    // Dry run
    //
    if (options.dryRunQuiet) {
        options.dryRun = true;
    }

    //
    // Version System
    //
    if (!options.versionSystem) {
        options.versionSystem = "semver";
    }

    //
    // Version Text
    //
    if (!options.versionText) {
        options.versionText = "Version";
    }

    //
    // changelog file
    //
    if (!options.changelogFile) {
        options.changelogFile = "CHANGELOG.md";
    }

    //
    // Changelog file line length
    //
    if (!options.changelogLineLen) {
        options.changelogLineLen = 80;
    }

    //
    // repo strip trailing '/'
    //
    if (options.repo && options.repo.endsWith("/")) {
        options.repo = options.repo.substring(0, options.repo.length - 1);
    }

    //
    // vcWebPath strip trailing '/'
    //
    if (options.vcWebPath && options.vcWebPath.endsWith("/")) {
        options.vcWebPath = options.vcWebPath.substring(0, options.vcWebPath.length - 1);
    }

    //
    // Check for environment vars that did not get set.  Env vars are wrapped in ${} and will
    // have been replaced by the nodejs config parser if they exist in the env.  Provide a warning
    // if any of the variables are not found in the environment.
    //
    Object.entries(options).forEach(([ property, value ]) =>
    {
        if (!property || !value) {
            return; // continue forEach()
        }
        if (value instanceof Array)
        {
            for (const val of value) {
                if (val instanceof String || typeof(val) === "string") {
                    if (val.trim().startsWith("${") && val.trim().endsWith("}")) {
                        logger.warn(`Option ${property} environment value was not found/set`);
                        logger.warn("   " + val);
                    }
                }
            }
        }
        else {
            if (value instanceof String || typeof(value) === "string") {
                if (value.trim().startsWith("${") && value.trim().endsWith("}")) {
                    logger.warn(`Option ${property} environment value was not found/set`);
                    logger.warn("   " + value);
                }
            }
        }
    });

    //
    // CI
    //
    if (!options.noCi)
    {
        // options.skipChangelogEdits = "Y";
        options.skipVersionEdits = "Y";
        options.versionFilesEditAlways = [];
        options.promptVersion = "N";
        logger.warn("CI environment detected, the following flags/properties have been set:");
        // logger.warn("   skipChangelogEdits     : Y");
        logger.warn("   skipVersionEdits       : Y");
        logger.warn("   promptVersion          : N");
        logger.warn("   versionFilesEditAlways : []");
    }

    //
    // TESTS
    //
    if (options.tests)
    {
        options.skipChangelogEdits = "Y";
        options.skipVersionEdits = "Y";
        options.versionFilesEditAlways = [];
        options.promptVersion = "N";
        logger.info("Tests run detected, the following flags/properties have been set:");
        logger.warn("   skipChangelogEdits     : Y");
        logger.warn("   skipVersionEdits       : Y");
        logger.warn("   promptVersion          : N");
        logger.warn("   versionFilesEditAlways : []");
    }

    //
    // *** TASKS ***
    //

    //
    // --republish  = no tasks
    //
    if (options.republish && options.taskMode)
    {
        logger.error("Invalid options specified:");
        logger.error("  The --republish switch cannot be used in task mode");
        return false;
    }

    //
    // Set transitive task flags
    //
    if (options.taskChangelogFile) {
        options.taskChangelog = true;
    }
    if (options.taskEmail || options.taskVersionUpdate || options.taskMantisbtRelease) {
        logger.warn("Level 3 task detected, the following flags/properties have been cleared:");
        logger.warn("   skipChangelogEdits");
        options.skipChangelogEdits = "Y";
    }

    //
    // Certain 'single-task mode' options can't be used together...
    //
    if ((options.taskChangelog && options.taskEmail) || (options.taskChangelog && options.taskVersionUpdate) ||
        (options.taskVersionUpdate && options.taskEmail) || (options.taskMantisbtRelease && options.taskEmail) ||
        (options.taskMantisbtRelease && options.taskVersionUpdate) || (options.taskMantisbtRelease && options.taskChangelog) ||
        (options.taskGithubRelease && options.taskEmail) || (options.taskGithubRelease && options.taskVersionUpdate) ||
        (options.taskGithubRelease && options.taskChangelog) || (options.taskChangelogView && options.taskChangelogHtmlView) ||
        (options.taskChangelogView && options.taskChangelogPrint) || (options.taskChangelogPrint && options.taskChangelogHtmlView) ||
        (options.taskChangelogFile && options.taskChangelogHtmlFile) || (options.taskChangelogPrint && options.taskChangelogHtmlPrint) ||
        (options.taskChangelogPrint && options.taskChangelogHtmlPrintVersion) || (options.taskChangelogHtmlPrint && options.taskChangelogPrintVersion) ||
        (options.taskChangelog && (options.taskChangelogFile || options.taskChangelogHtmlFile)) ||
        (options.taskChangelog && (options.taskChangelogView || options.taskChangelogHtmlView || options.taskChangelogPrint)) ||
        (options.taskVersionUpdate && options.versionForceCurrent))
    {
        logger.error("Invalid options specified:");
        logger.error("  Two or more of the specified tasks cannot be used together");
        logger.error("    changeLog           : " + options.taskChangelog);
        logger.error("    changeLog view      : " + options.taskChangelogView);
        logger.error("    changeLog view hmtl : " + options.taskChangelogHtmlView);
        logger.error("    changeLog file      : " + options.taskChangelogFile);
        logger.error("    changeLog file hmtl : " + options.taskChangelogHtmlFile);
        logger.error("    changeLog print     : " + options.taskChangelogPrint);
        logger.error("    changeLog htm print : " + options.taskChangelogHtmlPrint);
        logger.error("    email               : " + options.taskEmail);
        logger.error("    githubRelease       : " + options.taskGithubRelease);
        logger.error("    mantisRelease       : " + options.taskMantisbtRelease);
        logger.error("    republish           : " + options.republish);
        logger.error("    touchVersions       : " + options.taskVersionUpdate);
        return false;
    }

    if (options.taskTagVersion && isString(options.taskTagVersion)) {
        options.taskTag = true;
    }

    if (options.versionPreReleaseLimit && !options.versionPreReleaseId) {
        logger.error("Invalid options specified:");
        logger.error("   The 'versionPreReleaseLimit' option cannot be used w/o 'versionPreReleaseId'");
        return false;
    }

    if (options.taskCommit || options.taskTag || options.taskTagVersion) {
        for (const o in options) {
            if (o.startsWith("task") && options[o] === true && o !== "taskCommit" && o !== "taskTag" &&
                o !== "taskTagVersion" && o !== "taskMode" && o !== "taskModeStdOut")
            {
                logger.error("Invalid options specified:");
                logger.error(`   The 'taskCommit' and 'taskTag*' options cannot be used with '${o}'`);
                logger.error("   They can only be used alone, or together");
                return false;
            }
        }
    }

    if (!enforceSingleTask(options, "taskChangelogView", logger))             { return false; };
    if (!enforceSingleTask(options, "taskChangelogViewVersion", logger))      { return false; };
    if (!enforceSingleTask(options, "taskChangelogPrint", logger))            { return false; };
    if (!enforceSingleTask(options, "taskChangelogPrintVersion", logger))     { return false; };
    if (!enforceSingleTask(options, "taskChangelogHtmlPrint", logger))        { return false; };
    if (!enforceSingleTask(options, "taskChangelogHtmlPrintVersion", logger)) { return false; };
    if (!enforceSingleTask(options, "taskChangelogHdrPrint", logger))         { return false; };
    if (!enforceSingleTask(options, "taskChangelogHdrPrintVersion", logger))  { return false; };

    //
    // Only certain tasks are allowed with --version-force-current.  e.g. re-send a notification
    // email, or redo a Mantis or GitHub or NPM or other release
    //
    if (options.versionForceCurrent)
    {
        if (!options.taskMode)
        {
            logger.error("Invalid options specified:");
            logger.error("   The --version-force-current switch can only be usedin task mode");
            return false;
        }
        let taskSet = false;
        for (const o in options) {
            if (o.startsWith("task") && options[o] === true) {
                if (!o.endsWith("Release") && o !== "taskEmail" && o !== "taskMode" && o !== "taskModeStdOut")
                {
                    logger.error("Invalid options specified:");
                    logger.error(`   The versionForceCurrent switch cannot be used with '${o}'`);
                    return false;
                }
                taskSet = true;
            }
        }
        if (!taskSet) {
            logger.error("Invalid options specified:");
            logger.error("The versionForceCurrent switch can only be used with the following tasks:");
            logger.error("   task*XYZ*Release, taskEmail");
            return false;
        }
    }

    //
    // Only one stdout mode task can be used at a time
    //
    if (options.taskModeStdOut)
    {
        for (const o in options) {
            if (o.startsWith("task")) {
                if (options[o] === true) {
                    if (o !== "taskVersionCurrent" && o !== "taskVersionNext" && o !== "taskVersionInfo" &&
                        o !== "taskChangelogPrint" && o !== "taskCiEnvInfo" && o !== "taskVersionPreReleaseId" &&
                        o !== "taskReleaseLevel" && o !== "taskMode" && o !== "taskModeStdOut" &&
                        o !== "taskChangelogHdrPrint" && o !== "taskChangelogHtmlPrint")
                    {
                        logger.error("The specified task cannot be used with a 'stdout' type task:");
                        logger.error("   " + o);
                        return false;
                    }
                }
            }
        }
    }

    //
    // Validate version specified by taskChangelogPrintVersion or taskChangelogViewVersion
    // Only allow one of these commands at a time.  TODO - allow running both at same time
    //
    if (options.taskChangelogPrintVersion || options.taskChangelogViewVersion || options.taskChangelogHtmlPrintVersion) {
        // deepcode ignore MissingArgument: not valid
        if (!validateVersion(options.taskChangelogPrintVersion || options.taskChangelogViewVersion || options.taskChangelogHtmlPrintVersion)) {
            logger.error(`Invalid version ${options.taskChangelogPrintVersion} specified for task`);
            return false;
        }
    }

    //
    // Good to go...
    //
    logger.log("Options validated");
    return true;
}


function checkEmailConfiguration(options: IOptions, logger: any)
{
    if (options.taskEmail) {
        options.emailNotification = "Y";
    }
    if (options.emailNotification === "Y") {
        if (!options.emailMode) {
            options.emailMode = "std";
        }
        if (!options.emailSender || !options.emailServer || (!options.emailRecip && !options.testEmailRecip)) {
            logger.error("Email step is specified Y, but email is not configured in .publishrc");
            logger.error("Configure related email properties in .publishrc");
            return false;
        }
    }
    return true;
}


function checkScriptsSyntax(options: IOptions, logger: any)
{
    const check = (scripts: string[], scriptGroup: string) =>
    {
        for (const s in scripts)
        {
            if ([].hasOwnProperty.call(scripts, s))
            {   //
                // Replace the $(VERSION) tag with some different text since our script sanitization
                // will flag the parenthesis
                //
                scripts[s] = scripts[s].replace(/\$\(VERSION\)/g, "---VERSION---")
                                       .replace(/\$\(CURRENTVERSION\)/g, "---CURRENTVERSION---")
                                       .replace(/\$\(NEXTVERSION\)/g, "---NEXTVERSION---");
                //
                // Check windows style paths
                //
                const script = scripts[s];
                let parsed = escapeShellString(false, script);
                for (const a of parsed)
                {
                    if (!isString(a))
                    {
                        logger.error(`Invalid script syntax in '${scriptGroup}:'`);
                        logger.error("   " + script);
                        logger.error("Ensure proper quoting around any paths");
                        logger.error("Ensure proper quoting around wildcards that may be interpreted as glob patterns");
                        logger.error("Sanitization error info:");
                        Object.entries(a).forEach((p) =>
                        {
                            logger.error(`   ${p[0]}: ${p[1]}`);
                        });
                        return false;
                    }
                }
                //
                // Check arguments
                //
                if (script.includes("\\"))
                {
                    parsed = escapeShellString(true, script);
                    if (!parsed.includes("\\"))
                    {
                        logger.warn("Windows style paths need to be quoted or escaped");
                        logger.warn(`Script syntax auto-corrected in '${scriptGroup}':`);
                        logger.warn("   " + scripts[s]);
                        scripts[s] = scripts[s].replace(/\\/g, "\\\\");
                        logger.warn("   " + scripts[s]);
                    }
                }
            }
        }
        return true;
    };

    for (const o in options)
    {
        if (o.endsWith("Command") && !check(options[o], o)) {
            return false;
        }
    }

    return true;
}


function checkNpm(options: IOptions, logger: any)
{
    if (options.taskNpmRelease) {
        options.npmRelease = "Y";
    }
    if (options.npmRelease === "Y")
    {
        if (options.npmPackDist === "Y")
        {
            if (!options.distReleasePathSrc) {
                logger.error("You must specify 'distReleasePathSrc' if 'npmPackDist' flag is set to Y");
                return false;
            }
        }
        //
        // Set a default NPM registry
        //
        if (!options.npmRegistry) {
            options.npmRegistry = "https://registry.npmjs.org";
        }
        //
        // npmRegistry strip trailing '/'
        //
        else if (options.npmRegistry && options.npmRegistry.endsWith("/")) {
            options.npmRegistry = options.npmRegistry.substring(0, options.npmRegistry.length - 1);
        }
    }
    return true;
}


function checkOptionsTypes(options: IOptions, logger: any)
{
    for (const o in options)
    {
        if (publishRcOpts[o])
        {
            const optType = publishRcOpts[o][1];
            if (optType === "flag")
            {
                if (options[o]) {
                    if (options[o] !== "Y" && options[o] !== "N") {
                        return doInvalidOpt(o, "Accepted values are Y|N", options, logger);
                    }
                }
                else {
                    options[o] = publishRcOpts[o][2];
                }
            }
            else if (optType === "string")
            {
                if (options[o]) {
                    if (!isString(options[o])) {
                        return doInvalidOpt(o, "Value must be a string", options, logger);
                    }
                }
            }
            else if (optType.startsWith("string"))
            {
                if (options[o]) {
                    for (const s of options[o])
                    {
                        if (!isString(s)) {
                            return doInvalidOpt(o, "All values must be strings", options, logger);
                        }
                    }
                }
            }
            else if (optType === "number")
            {
                if (options[o]) {
                    if (!isNumeric(options[o])) {
                        return doInvalidOpt(o, "Value must be a number", options, logger);
                    }
                }
            }
            else if (optType.startsWith("enum("))
            {
                if (options[o]) {
                    const allowedValues = optType.substring(5, optType.length - 1).trim().split("|");
                    if (!isString(options[o]) || !allowedValues.includes(options[o].toString())) {
                        return doInvalidOpt(o, "Accepted values are " + allowedValues.join("|"), options, logger);
                    }
                }
                else {
                    options[o] = publishRcOpts[o][2];
                }
            }
        }
    }
    return true;
}


function checkVersionFiles(options: IOptions, logger: any)
{
    //
    // Version files
    //
    function validateVersionFileDef(vf: IVersionFile)
    {
        if (path.basename(vf.path) !== "package.json")
        {
            if (!vf.versionInfo)
            {
                vf.versionInfo = { version: undefined, system: "semver", info: undefined };
            }
            if (!vf.regex)
            {
                if (vf.versionInfo.system === "semver") {
                    vf.regex = "[0-9a-zA-Z\\.\\-]{5,}";
                }
                else {
                    vf.regex = "[0-9]+";
                }
            }
            if ((!vf.regexVersion || !vf.regexWrite))
            {
                logger.error("Invalid versionFile regex patterns found");
                logger.error("   Path           : " + vf.path);
                logger.error("   Regex          : " + vf.regex ?? "not set");
                logger.error("   Version Regex  : " + vf.regexVersion ?? "not set");
                return false;
            }
            if (!vf.regex.includes("VERSION") || !vf.regexWrite.includes("VERSION"))
            {
                logger.error("Invalid versionFile regex patterns found");
                logger.error("   Path           : " + vf.path);
                logger.error("   Regex          : invalid - missing '(VERSION)' capture text");
                return false;
            }
        }
    }

    if (options.versionFiles)
    {
        for (const vf of options.versionFiles)
        {
            if (!isObject(vf)) {
                logger.error("Invalid versionFiles definition, must be an array of IVersionFile");
                return false;
            }
            else if (!vf.path) {
                logger.error("Invalid versionFiles definition, must be an array of IVersionFile");
                logger.error("   The 'path' property is not defined on one or more definitions");
                return false;
            }
            validateVersionFileDef(vf);
            if (vf.setFiles) {
                if (vf.setFiles.length === 0)
                {
                    logger.error("Invalid versionFile 'setFiles' found, cannot be zero length");
                    logger.error("   Path           : " + vf.path);
                    return false;
                }
                for (const sf of options.versionFiles) {
                    validateVersionFileDef(sf);
                }
            }
        }
    }
    return true;
}


function convertStringsToArrays(options: IOptions)
{
    Object.entries(options).forEach((p) =>
    {
        if (p[0].endsWith("Command") && isString(p[1])) {
            options[p[0]] = [ p[1] ]; // convert to array
        }
    });

    if (options.emailHrefs && isString(options.emailHrefs))
    {
        options.emailHrefs = [ options.emailHrefs ]; // convert to array
    }
    if (options.githubAssets && isString(options.githubAssets))
    {
        options.githubAssets = [ options.githubAssets ]; // convert to array
    }
    if (options.mantisbtAssets && isString(options.mantisbtAssets))
    {
        options.mantisbtAssets = [ options.mantisbtAssets ]; // convert to array
    }
    if (options.vcFiles && isString(options.vcFiles))
    {
        options.vcFiles = [ options.vcFiles ]; // convert to array
    }
    if (options.vcRevertFiles && isString(options.vcRevertFiles))
    {
        options.vcRevertFiles = [ options.vcRevertFiles ]; // convert to array
    }
    if (options.versionFiles && !(options.versionFiles instanceof Array))
    {
        options.versionFiles = [ options.versionFiles ]; // convert to array
    }
    if (options.versionFilesEditAlways && isString(options.versionFilesEditAlways))
    {
        options.versionFilesEditAlways = [ options.versionFilesEditAlways ]; // convert to array
    }
    if (options.versionFilesScrollDown && isString(options.versionFilesScrollDown))
    {
        options.versionFilesScrollDown = [ options.versionFilesScrollDown ]; // convert to array
    }
    if (options.emailRecip && isString(options.emailRecip))
    {
        options.emailRecip = [ options.emailRecip ]; // convert to array
    }
    if (options.testEmailRecip && isString(options.testEmailRecip))
    {
        options.testEmailRecip = [ options.testEmailRecip ]; // convert to array
    }
    if (options.commitMsgMap && !(options.commitMsgMap instanceof Array))
    {
        options.commitMsgMap = [ options.commitMsgMap ]; // convert to array
    }
}




function doInvalidOpt(p: string, d: string, options: IOptions, logger: any)
{
    logger.error(`Invalid value specified for '${p}' in ${path.basename(options.configFilePath)}:`);
    logger.error(`   ${p}`);
    logger.error(d);
    return false;
}


function enforceSingleTask(options: IOptions, task: string, logger: any)
{
    if (options[task]) {
        for (const o in options) {
            if (o.startsWith("task") && options[o] === true && o !== "taskMode" && o !== "taskModeStdOut" && o !== task)
            {
                logger.error("Invalid options specified:");
                logger.error(`   The '${task}' option cannot be used together with other task options`);
                return false;
            }
        }
    }
    return true;
}


function setDefaultEditor(options: IOptions, logger: any)
{
    if (process.platform === "win32") {
        logger.log("Text editor not found, falling back to 'notepad'");
        options.textEditor = "notepad.exe";
    }
    else {
        logger.log("Text editor not found, falling back to 'vi'");
        options.textEditor = "vi";
    }
}


async function setEditor(options: IOptions, logger: any, env: any)
{
    if (options.textEditor)
    {
        options.textEditor = options.textEditor.trim();
        if (!options.textEditor.toLowerCase().startsWith("notepad") && !(await pathExists(options.textEditor)))
        {
            let found = false;
            const paths = process.platform === "win32" ? env.Path.split(";") : env.PATH.split(";");
            for (const p of paths)
            {
                let fullPath = path.join(p, options.textEditor);
                if (await pathExists(fullPath)) {
                    found = true;
                    break;
                }
                fullPath = path.join(p, options.textEditor + ".exe");
                if (await pathExists(fullPath)) {
                    found = true;
                    break;
                }
            }
            if (!found) { setDefaultEditor(options, logger); }
        }
        else { setDefaultEditor(options, logger); }
    }
    else {
        setDefaultEditor(options, logger);
    }

    if (process.platform === "win32" && !options.textEditor.endsWith(".exe")) {
        options.textEditor += ".exe";
    }
}

function setSvn(options: IOptions)
{
    if (options.repoType === "svn")
    {
        if (options.branch === "trunk")
        {
            if (!options.repo.endsWith("trunk"))
            {
                if (options.repo.includes("branches/"))
                {
                    options.repo = options.repo.substring(0, options.repo.indexOf("branches/")) + "trunk";
                }
                else {
                    if (!options.repo.endsWith("/")) {
                        options.repo += "/";
                    }
                    options.repo = options.repo + options.branch;
                }
            }
        }
        else
        {
            if (options.repo.indexOf("branches/") === -1)
            {
                if (options.repo.endsWith("trunk"))
                {
                    options.repo = options.repo.replace("trunk", options.branch);
                }
                else {
                    if (!options.repo.endsWith("/")) {
                        options.repo += "/";
                    }
                    options.repo = options.repo + options.branch;
                }
            }
        }
    }
}
