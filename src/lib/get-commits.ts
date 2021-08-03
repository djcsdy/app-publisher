import gitLogParser from "git-log-parser";
import getStream from "get-stream";
import { EOL } from "os";
import { IChangelogEntry, ICommit, IContext } from "../interface";
const execa = require("execa");
const xml2js = require("xml2js");

export = getCommits;

/**
 * Retrieve the list of commits on the current branch since the commit sha associated with the last release, or all the commits of the current branch if there is no last released version.
 *
 * @param {Object} context app-publisher context.
 *
 * @return {Promise<Array<Object>>} The list of commits on the branch `branch` since the last release.
 */
async function getCommits(context: IContext): Promise<ICommit[]>
{
    let commits: ICommit[] = [];
    const { cwd, env, options, lastRelease: { head }, logger } = context;

    if (head) {
        logger.info("Use head revision " + head);
    }
    else {
        logger.info("No previous release found, retrieving all commits");
    }

    if (options.repoType === "git")
    {
        function processCommits(commit: any)
        {
            const c = {
                author: commit.author,
                committer: commit.committer,
                gitTags: commit.gitTags.trim(),
                hash: commit.hash,
                message: commit.message.trim(),
                committerDate: commit.committerDate,
                scope: undefined,
                subject: undefined
            };
            parseCommitMessage(context, c, commits);
            return c;
        }

        Object.assign(gitLogParser.fields, { hash: "H", message: "B", gitTags: "d", committerDate: { key: "ci", type: Date } });

        (await getStream.array(
            gitLogParser.parse({
                _: `${head ? head + ".." : ""}HEAD` }, { cwd, env: { ...process.env, ...env }
            })
        ))
        .map(processCommits);
    }
    else if (options.repoType === "svn")
    {
        //
        // Sample log entry:
        //
        // <log>
        //    <logentry
        //       revision="16845">
        //       <author>smeesseman</author>
        //       <date>2021-06-17T04:22:16.273124Z</date>
        //       <paths>
        //          <path copyfrom-path="/app-publisher/trunk"
        //                copyfrom-rev="16844"
        //                action="A"
        //                prop-mods="true"
        //                text-mods="false"
        //                kind="dir">
        //             /app-publisher/tags/v2.7.2
        //          </path>
        //       </paths>
        //       <msg>chore(release): tag version 2.7.2 [skip ci]</msg>
        //    </logentry>
        // </log>

        let xml;
        const svnUser = env.SVN_AUTHOR_NAME,
              svnToken = env.SVN_TOKEN,
              parser = new xml2js.Parser();
        //
        // Retrieve commits since last version tag
        //
        logger.info(`Retrieving commits since last version (revision ${head})`);

        if (svnUser && svnToken) {
            xml = await execa.stdout("svn", ["log", "--use-merge-history", "--xml", `${options.repo}`, "--verbose", "--limit", "250", "-r", `${head}:HEAD`,
                                             "--non-interactive", "--no-auth-cache", "--username", svnUser, "--password", `${svnToken}`]);
        }
        else {
            xml = await execa.stdout("svn", ["log", "--use-merge-history", "--xml", `${options.repo}`, "--verbose", "--limit", "250", "-r", `${head}:HEAD`,
                                             "--non-interactive", "--no-auth-cache"]);
        }
        //
        // TODO - check execa rtn code?
        //
        // if ($LASTEXITCODE -ne 0) {
        //     logger.info("Failed to retrieve commits" "red"
        //     return $comments
        // }
        logger.info("Parsing commits response from SVN");

        function parseCommits(logEntries: any)
        {
            for (const logEntry of logEntries)
            {
                if (logEntry.msg && logEntry.msg[0])
                {
                    const commit = {
                        author: {
                            name: logEntry.author[0]
                        },
                        committer: {
                            name: logEntry.author[0]
                        },
                        message: logEntry.msg[0].trim(),
                        hash: logEntry.$.revision,
                        committerDate: logEntry.date[0],
                        scope: undefined,
                        subject: undefined
                    };
                    parseCommitMessage(context, commit, commits);
                }
                if (logEntry.logentry) { // merged commit list?
                    parseCommits(logEntry.logentry);
                }
            }
        }

        try {
            parser.parseString(xml, (err, result) =>
            {
                if (err) {
                    console.log(err);
                    return commits;
                }
                //
                // Parse the commit messages
                //
                parseCommits(result.log.logentry);
            });
        }
        catch {
            logger.warn("No commits found or no version tag exists");
        }
    }

    //
    // Sort
    //
    if (options.verbose) {
        logger.info("Sorting commit messages");
    }
    commits.sort((c1: ICommit, c2: ICommit) =>
    {
        const c1subj = c1.subject !== "fix" ? c1.subject : "bug fix",
              c2subj = c2.subject !== "fix" ? c2.subject : "bug fix";
        if (c1subj === "build") {
            return 1;
        }
        else if (c1subj === "build") {
            return -1;
        }
        else if (c1subj === "ci") {
            return c2subj === "build" ? -1 : 1;
        }
        else if (c2subj === "ci") {
            return c1subj === "build" ? 1 : -1;
        }
        else if (c1subj && c2subj) {
            return c1subj.localeCompare(c2subj);
        }
        else if (c1subj) {
            return -1;
        }
        else if (c2subj) {
            return 1;
        }
        const a = c1.message,
              b = c2.message;
        if (a && b) {
            if (/^[a-z]+\([a-z0-9\- ]*\)\s*: *|^[a-z]+\s*: */g.test(a) && /^[a-z]+\([a-z0-9\- ]*\)\s*: *|^[a-z]+\s*: */g.test(b)) {
                return a.localeCompare(b);
            }
            else if (/^[a-z]+\([a-z0-9\- ]*\)\s*: *|^[a-z]+\s*: */g.test(a)) {
                return -1;
            }
            else if (/^[a-z]+\([a-z0-9\- ]*\)\s*: *|^[a-z]+\s*: */g.test(b)) {
                return 1;
            }
        }
        if (!a) return 1;
        if (!b) return -1;
        return 0;
    });

    logger.info(`Found ${commits.length} commits since last release`);
    if (options.verbose) {
        context.stdout.write(`Parsed commits:${EOL}${commits.map((c) => c.message).join(EOL)}${EOL}`);
    }

    return commits;
}


function parseCommitMessage(context: IContext, commit: ICommit, commits: ICommit[])
{
    const { options, logger } = context;
    let regex = /^([a-z]+)\(([a-z0-9\- ]*)\)\s*: */gmi;
    let match: RegExpExecArray,
        nCommit: ICommit;

    while ((match = regex.exec(nCommit.message)) !== null)
    {
        nCommit = { ...commit };
        if (options.verbose) {
            logger.log(`   Extracted subject ${match[1]} from commit message`);
            logger.log(`   Extracted scope ${match[2]} from commit message`);
        }
        nCommit.subject = match[1];
        nCommit.scope = match[2];
        commits.push(nCommit);
    }

    regex = /^([a-z]+)\s*: */gmi;
    while ((match = regex.exec(commit.message)) !== null)
    {
        nCommit = { ...commit };
        if (options.verbose) {
            logger.log(`   Extracted subject ${match[1]} from commit message`);
        }
        nCommit.subject = match[1];
        commits.push(nCommit);
    }
}
