
import * as util from "./lib/utils";
import * as child_process from "child_process";
import gradient from "gradient-string";
import chalk from "chalk";
import marked from "marked";
import TerminalRenderer from "marked-terminal";
import hookStd from "hook-std";
import hideSensitive = require("./lib/hide-sensitive");
import getConfig = require("./lib/get-config");
import getReleaseLevel = require("./lib/commit-analyzer");
import verify = require("./lib/verify");
import getCommits = require("./lib/get-commits");
import getCurrentVersion = require("./lib/version/get-current-version");
import getNextVersion = require("./lib/version/get-next-version");
import getLastRelease = require("./lib/get-last-release");
import getGitAuthUrl = require("./lib/get-git-auth-url");
import getLogger = require("./lib/get-logger");
import validateOptions = require("./lib/validate-options");
import doGithubRelease = require("./lib/releases/github");
import doMantisbtRelease = require("./lib/releases/mantisbt");
import doNpmRelease = require("./lib/releases/npm");
import setVersions = require("./lib/version/set-versions");
import * as npm from "./lib/version/npm";
import getError = require("./lib/get-error");
import { template, pick, isString } from "lodash";
import { COMMIT_NAME, COMMIT_EMAIL } from "./lib/definitions/constants";
import { sendNotificationEmail } from "./lib/email";
import { createSectionFromCommits, doChangelogFileEdit, doHistoryFileEdit } from "./lib/changelog-file";
import { fetch, verifyAuth, getHead, tag, push } from "./lib/repo";
import { EOL } from "os";
const envCi = require("@spmeesseman/env-ci");
const pkg = require("../package.json");


marked.setOptions({ renderer: new TerminalRenderer() });


async function run(context: any, plugins: any): Promise<boolean>
{
    const { cwd, env, options, logger } = context;
    const runTxt = !options.dryRun ? "run" : "test run";

    //
    // If user specified 'cfg' or '--config', then just display config and exit
    //
    if (options.config)
    {
        const title =
`----------------------------------------------------------------------------
 Run Configuration - .publishrc / cmd line
----------------------------------------------------------------------------
        `;
        console.log(chalk.bold(gradient("cyan", "pink").multiline(title, {interpolation: "hsv"})));
        console.log(JSON.stringify(options, undefined, 3));
        return true;
    }

    const {
        isCi, branch: ciBranch, isPr, name: ciName, root: ciRoot, build: ciBuild, buildUrl: ciBuildUrl, commit: ciCommit
    } = envCi({ env, cwd });

    if (!options.branch) {
        options.branch = ciBranch;
    }

    //
    // If user specified 'cfg' or '--config', then just display config and exit
    //
    if (options.taskCiEnv)
    {
        const title =
`----------------------------------------------------------------------------
 CI Environment Details
----------------------------------------------------------------------------
        `;
        console.log(chalk.bold(gradient("cyan", "pink").multiline(title, {interpolation: "hsv"})));
        if (isCi)
        {
            console.log("  CI Name           : " + ciName);
            console.log("  CI Branch         : " + ciBranch);
            console.log("  Is PR             : " + isPr);
            console.log("  Commit            : " + isPr);
            console.log("  Root              : " + ciRoot);
            console.log("  Commit            : " + ciCommit);
            console.log("  Build             : " + ciBuild);
            console.log("  Build URL         : " + ciBuildUrl);
        }
        else {
            console.log("  No known CI environment was found");
        }
        return true;
    }

    //
    // Set some additional options
    //
    options.appPublisherVersion = pkg.version;
    options.isNodeJsEnv = typeof module !== "undefined" && module.exports;

    //
    // Set task mode flag on the options object
    //
    for (const o in options)
    {
        if (o.startsWith("task")) {
            if (options[o] === true) {
                options.taskMode = true;
                break;
            }
        }
    }

    if (options.taskMode) {
        options.verbose = false;
    }

    //
    // Set task mode stdout flag on the options object
    //
    options.taskModeStdOut = !!(options.taskVersionCurrent || options.taskVersionNext || options.taskVersionInfo ||
                                options.taskCiEvInfo || options.taskVersionPreReleaseId);
    //
    // Display mode - bin mode, or node env
    //
    if (!options.taskModeStdOut)
    {
        const mode = options.isNodeJsEnv ? "Node.js" : "bin mode";
        logger.log(`Running ${pkg.name} version ${pkg.version} in ${mode}`);
    }

    //
    // Check CI environment
    //
    if (!isCi && !options.dryRun && !options.noCi)
    {
        logger.error("This run was not triggered in a known CI environment, use --no-ci flag for local publish.");
        return false;
    }
    else
    {
        if (options.repoType === "git")
        {
            Object.assign(env, {
                GIT_AUTHOR_NAME: COMMIT_NAME,
                GIT_AUTHOR_EMAIL: COMMIT_EMAIL,
                GIT_COMMITTER_NAME: COMMIT_NAME,
                GIT_COMMITTER_EMAIL: COMMIT_EMAIL,
                ...env,
                GIT_ASKPASS: "echo",
                GIT_TERMINAL_PROMPT: 0
            });
        }
        else // default SVN
        {
            Object.assign(env, {
                SVN_AUTHOR_NAME: COMMIT_NAME,
                SVN_AUTHOR_EMAIL: COMMIT_EMAIL,
                SVN_COMMITTER_NAME: COMMIT_NAME,
                SVN_COMMITTER_EMAIL: COMMIT_EMAIL,
                ...env,
                SVN_ASKPASS: "echo",
                SVN_TERMINAL_PROMPT: 0
            });
        }
    }

    if (isCi && isPr && !options.noCi)
    {
        logger.error("This run was triggered by a pull request and therefore a new version won't be published.");
        return false;
    }

    if (isCi && ciBranch !== options.branch)
    {
        logger.error(`This ${runTxt} was triggered on the branch '${ciBranch}', but is configured to ` +
                     `publish from '${options.branch}'`);
        logger.error("   A new version won’t be published");
        return false;
    }
    else if (ciBranch !== options.branch && !options.taskModeStdOut)
    {
        logger.warn(`This ${runTxt} was triggered on the branch '${ciBranch}', but is configured to ` +
                    `publish from '${options.branch}'`);
        logger.warn("   Continuing due to non-ci environment");
    }

    if (!options.taskModeStdOut) {
        logger[options.dryRun ? "warn" : "log"](
            `Run automated release from branch '${options.branch}'${options.dryRun ? " in dry-run mode" : ""}`
        );
    }

    if (options.verbose) // even if it's a stdout type task
    {
        logger.log(JSON.stringify(options, undefined, 3));
    }

    //
    // If we're running a task only, then set the logger to empty methods
    //
    if (options.taskModeStdOut) {
        context.logger = {
            log: () => { /* */ },
            warn: () => { /* */ },
            success: () => { /* */ },
            error: () => { /* */ }
        };
    }

    if (options.node)
    {
        await runNodeScript(context, plugins);
    }
    else {
        await runPowershellScript(options, logger);
    }
}


async function runNodeScript(context: any, plugins: any)
{
    const { cwd, env, options, logger } = context;

    //
    // Validate options / cmd line arguments
    //
    if (!(await validateOptions(context)))
    {
        return false;
    }

    //
    // If a l1 task is processed, we'll be done
    //
    let taskDone = await processTasks1(context);
    if (taskDone !== false) {
        return taskDone;
    }

    //
    // No task, proceed with publish run...
    //

    //
    // Verify
    //
    await verify(context);

    //
    // If theres not a git url specified in .publishrc or cmd line, get remote origin url
    //
    if (options.repoType === "git" && !options.repo)
    {
        options.repo = await getGitAuthUrl(context);
    }

    //
    // Authentication
    //
    try {
        await verifyAuth(context, { cwd, env });
    }
    catch (error) {
        throw error;
    }
    logger.success(`Allowed to push to the ${options.repoType} repository`);


    // await plugins.verifyConditions(context);

    //
    // Fetch tags (git only)
    //
    await fetch(options, { cwd, env });

    //
    // Populate context with last release info
    //
    context.lastRelease = await getLastRelease(context); // calls getTags()

    //
    // Populate context with commits
    //
    context.commits = await getCommits(context);

    //
    // Populate next release info
    //
    const nextRelease = {
        level: await getReleaseLevel(context),
        head: await getHead({ cwd, env }),
        version: undefined,
        tag: undefined,
        notes: undefined
    };

    //
    // If there wer eno commits that set the release level to 'patch', 'minor', or 'major',
    // then we're done
    //
    if (!nextRelease.level)
    {
        logger.log("There are no relevant changes, so no new version is released.");
        return false;
    }

    //
    // Populate context with next release info
    //
    context.nextRelease = nextRelease;

    //
    // Version
    //
    const versionInfo = getNextVersion(context);
    if (!versionInfo.versionInfo) {
        nextRelease.version = versionInfo.version;
    }
    else {
        nextRelease.version = versionInfo.version;
        //
        // TODO - process versionInfo (maven builds)
        //
    }

    //
    // Tag name for next release
    //
    nextRelease.tag = template(options.tagFormat)({ version: nextRelease.version });

    // await plugins.verifyRelease(context);

    // nextRelease.notes = await plugins.generateNotes(context);
    nextRelease.notes = createSectionFromCommits(context);

    // await plugins.prepare(context);

    //
    // Changelog / history file
    //
    const doChangelog = options.taskChangelog || options.taskChangelogView || options.taskChangelogFile || !options.taskMode;
    logger.log("Do cl / history file : " + doChangelog);
    if (options.historyFile && doChangelog)
    {
        doHistoryFileEdit(context);
    }
    if (options.changelogFile && doChangelog)
    {
        doChangelogFileEdit(context);
    }

    //
    // Pre-build scipts (.publishrc)
    //
    if (!options.taskMode) {
        await util.runScripts({ options, logger }, "preBuild", options.preBuildCommand, true, true);
    }

    //
    // Update relevant files with new version #
    //
    if (!options.taskMode || options.taskTouchVersions)
    {
        await setVersions(context);
    }

    //
    // Build scipts (.publishrc)
    //
    if (!options.taskMode) {
        await util.runScripts({ options, logger }, "build", options.buildCommand, true, true);
    }

    //
    // NPM release
    //
    // Store location paths depending on publish types, these will be used to set links to
    // locations in the release email
    //
    // $TargetNetLocation = ""
    // $NpmLocation = ""
    // $NugetLocation = ""
    //
    if (options.npmRelease === "Y" && !options.taskMode)
    {
        await doNpmRelease(context, defaultScope);
    }

    //
    // Post-build scripts (.publishrc)
    //
    if (!options.taskMode) {
        await util.runScripts({ options, logger }, "postBuild", options.postBuildCommand);
    }

    //
    // Restore any configured package.json values to the original values
    //
    if (util.pathExists("package.json") && (!options.taskMode || options.taskTouchVersions)) {
        npm.restorePackageJson(context);
    }

    //
    // If a l2 task is processed, we'll be done
    //
    taskDone = await processTasks2(context);
    if (taskDone !== false) {
        return taskDone;
    }

    //
    // Github release
    //
    if (options.repo === "git" && options.githubRelease === "Y" && (!options.taskMode || options.taskGithubRelease))
    {   //
        // Pre-github release (.publishrc)
        //
        await util.runScripts({ options, logger }, "preGithubRelease", options.githubReleasePreCommand);
        //
        // Perform Github release
        //
        await doGithubRelease(context);
        //
        // Post-github release (.publishrc)
        //
        await util.runScripts({ options, logger }, "postGithubRelease", options.githubReleasePostCommand);
    }

    //
    // MantisBT release
    //
    if (options.mantisbtRelease === "Y" && (!options.taskMode || options.taskMantisbtRelease))
    {   //
        // Pre-mantis release (.publishrc)
        //
        await util.runScripts({ options, logger }, "preMantisRelease", options.mantisbtReleasePreCommand);
        //
        // Perform MantisBT release
        //
        await doMantisbtRelease(context);
        //
        // Post-mantis release scripts (.publishrc)
        //
        await util.runScripts({ options, logger }, "postMantisRelease", options.mantisbtReleasePostCommand);
    }

    //
    // Deployment scripts
    //
    if (!options.taskMode)
    {
        if (options.skipDeployPush !== "Y" && !options.dryRun)
        {
            await util.runScripts(context, "deploy", options.deployCommand); // (.publishrc)
        }
        else {
            logger.log("Skipped running custom deploy script");
        }
    }

    //
    // Notifiation email
    //
    if (!options.taskChangelog && !options.taskTouchVersions && !options.taskMantisbtRelease && !options.taskCiEnvSet &&
        !options.taskModeStdOut && (options.emailNotification === "Y" || options.taskEmail)) {
        await sendNotificationEmail(context);
    }

    //
    // Pre-commit scripts
    //
    if (!options.taskMode) {
        await util.runScripts(context, "preCommit", options.preCommitCommand); // (.publishrc)
    }

    //
    // Tag
    //
    if (options.dryRun)
    {
        logger.warn(`Skip ${nextRelease.tag} tag creation in dry-run mode`);
        //
        // TODO - Revert
        //
        if (options.dryRunVcRevert) // && options.noCi)
        {
            // Revert
        }
    }
    else if (!options.taskMode || options.taskCommit || options.taskTag)
    {
        // Create the tag before calling the publish plugins as some require the tag to exists
        if (!options.taskCommit) {
            await tag(nextRelease.tag, { cwd, env }, options.repoType);
            logger.success(`Created tag ${nextRelease.tag}`);
        }
        if (!options.taskTag) {
            await push(options.repo, { cwd, env }, options.repoType);
            logger.success(`Successfully pushed changes for v${nextRelease.version}`);
        }
    }

    // context.releases = await plugins.publish(context);

    // await plugins.success(context);

    //
    // Success
    //
    logger.success((options.dryRun ? "Dry Run: " : "") + `Published release ${nextRelease.version}`);

    //
    // Display cjangelog notes if thisis a dry run
    //
    if (options.dryRun)
    {
        logger.log(`Release notes for version ${nextRelease.version}:`);
        if (nextRelease.notes)
        {
            // context.stdout.write(marked(nextRelease.notes));
            context.stdout.write(nextRelease.notes.replace(/\r\n/g, "\n"));
        }
    }

    return pick(context, [ "lastRelease", "commits", "nextRelease", "releases" ]);
}


/**
 * Tasks that can be processed without retrieving commits and other tag related info
 *
 * @param context context
 */
async function processTasks1(context: any): Promise<boolean>
{
    const options = context.options;

    if (options.taskVersionCurrent)
    {
        const versionInfo = await getCurrentVersion(context);
        console.log(versionInfo.version);
        return true;
    }
    else if (options.taskEmail)
    {
        sendNotificationEmail(context);
        return true;
    }
    else if (options.taskVersionPreReleaseId && isString(options.taskVersionPreReleaseId))
    {
        let preRelId = "error",
            match: RegExpExecArray;
        if ((match = /^(?:v|V){0,1}[0-9.]+\-([a-z]+)\.{0,1}[0-9]*$/m.exec(options.taskVersionPreReleaseId)) !== null)
        {
            preRelId = match[1];
        }
        console.log(preRelId);
        return true;
    }

    // if (szOutputFile) {
    //     writeFileSync(szOutputFile, szFinalContents);
    //     logger.log("   Saved release history output to $szOutputFile");
    // }

    return false;
}


/**
 * Tasks that need to be processed "after" retrieving commits and other tag related info
 *
 * @param context context
 */
async function processTasks2(context: any): Promise<boolean>
{
    const options = context.options,
          logger = context.logger,
          lastRelease = context.lastRelease,
          nextRelease = context.nextRelease;

    if (options.taskVersionNext)
    {
        console.log(context.nextRelease.version);
        return true;
    }

    if (options.taskVersionInfo) {
        console.log(lastRelease.version + "|" + nextRelease.version);
        return true;
    }

    if (options.taskCiEnvSet)
    {
        logger.log("Write CI environment to file 'ap.env'");
        let fileContent = lastRelease.version + EOL + nextRelease.version + EOL;
        if (options.historyFile) {
            fileContent += (options.historyFile + EOL);
        }
        else if (options.changelogFile) {
            fileContent += (options.changelogFile + EOL);
        }
        util.writeFile("ap.env", fileContent);
        return true;
    }

    if (options.taskCiEnvInfo)
    {
        if (options.historyFile) {
            console.log(`${lastRelease.version}|${nextRelease.version}|${options.historyFile}`);
        }
        else if (options.changelogFile) {
            console.log(`${lastRelease.version}|${nextRelease.version}|${options.changelogFile}`);
        }
        else {
            console.log(`${lastRelease.version}|${nextRelease.version}`);
        }
        return true;
    }

    // if (szOutputFile) {
    //     writeFileSync(szOutputFile, szFinalContents);
    //     logger.log("   Saved release history output to $szOutputFile");
    // }

    return false;
}


async function runPowershellScript(options: any, logger: any)
{
    //
    // Find Powershell script
    //
    // Perform search in the following order:
    //
    //     1. Local node_modules
    //     2. Local script dir
    //     3. Global node_modules
    //     4. Windows install
    //
    const ps1Script = util.getPsScriptLocation("app-publisher");
    if (!ps1Script) {
        logger.error("Could not find powershell script app-publisher.ps1");
        return;
    }

    //
    // Launch Powershell script
    //
    // const ec = child_process.spawnSync("powershell.exe", [`${ps1Script} ${options}`], { stdio: "inherit"});
    // if (ec.status !== 0)
    // {
    //    logger.error("Powershell script exited with error code " + ec.status.toString());
    //    return ec.status;
    // }
    // logger.success("Published release successfully");
    // logger.success(`Published release ${nextRelease.version}`);
    const isTaskCmd = options.taskChangelog || options.taskEmail || options.taskTouchVersions || options.taskMantisbtRelease ||
                      options.taskVersionCurrent || options.taskVersionNext || options.taskCiEnvSet,
          isStdOutCmd = options.taskModeStdOut,
          child = child_process.spawn("powershell.exe", [`${ps1Script} '${JSON.stringify(options)}'`], { stdio: ["pipe", "pipe", "pipe"], env: process.env});
    // const child = child_process.spawn("powershell.exe", [`${ps1Script} ${options}`], { stdio: ["pipe", "inherit", "inherit"] });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    process.stdin.on("data", data => {
        if (!child.killed) {
            child.stdin.write(data);
        }
    });

    child.stdout.on("data", data =>
    {
        if (child.killed) {
            return;
        }
        logPowershell(data, logger, isStdOutCmd);
    });

    child.stderr.on("data", data => {
        if (child.killed) {
            return;
        }
        logPowershell(data, logger, isStdOutCmd);
    });

    let iCode: number;
    child.on("exit", code =>
    {
        // if (fs.existsSync("ap.env"))
        // {
        //     const envContent = fs.readFileSync("ap.env");
        //     if (envContent)
        //     {
        //         const envVars = envContent.toString().split("\n");
        //         process.env.AP_CURRENT_VERSION = envVars[0];
        //         process.env.AP_NEXT_VERSION = envVars[1];
        //         process.env.AP_CHANGELOG_FILE = envVars[2];
        //         fs.unlinkSync("ap.env");
        //     }
        // }
        iCode = code;
        if (iCode === 0) {
            if (!isStdOutCmd) {
                if (!isTaskCmd) {
                    logger.success("Successfully published release");
                }
                else {
                    logger.success("Successfully completed task");
                }
            }
        }
        else {
            logger.error(`Failed to publish release - return code '${iCode}'`);
        }
        process.exit(iCode);
    });
}


function logPowershell(data: string, logger: any, isStdOutCmd: boolean)
{
    if (!data) {
        return;
    }

    //
    // Trim
    //
    data = data.trimRight();
    while (data[0] === "\n" || data[0] === "\r") {
        data = data.substring(1);
    }

    if (!data) {
        return;
    }

    const isError = data.includes("[ERROR] ");

    if (isStdOutCmd && !isError) {
        console.log(data);
        return;
    }

    if (data.includes("\r\n")) {
        data.replace(/\r\n/gm, "\r\n                                  ");
    }
    else if (data.includes("\n")) {
        data.replace(/\n/gm, "\n                                  ");
    }
    if (data.includes("[INFO] ")) {
        logger.log(data.substring(7));
    }
    else if (data.includes("[NOTICE] ")) {
        logger.log(data.substring(9));
    }
    else if (data.includes("[WARNING] ")) {
        logger.warn(data.substring(10));
    }
    else if (data.includes("[SUCCESS] ")) {
        logger.success(data.substring(10));
    }
    else if (isError) {
        logger.error(data.substring(8));
    }
    else if (data.includes("[PROMPT] ")) {
        logger.star(data.substring(9));
    }
    else if (data.includes("[INPUT] ")) {
        logger.star(data.substring(8));
    }
    else if (data.includes("[RAW] ")) {
        console.log(data.substring(6));
    }
    else {
        logger.log(data);
    }
}


function logErrors({ logger, stderr }, err)
{
    const errors = util.extractErrors(err).sort(error => (error.semanticRelease ? -1 : 0));
    for (const error of errors)
    {
        if (error.semanticRelease)
        {
            logger.error(`${error.code} ${error.message}`);
            if (error.details)
            {
                stderr.write(marked(error.details));
            }
        }
        else {
            logger.error("An error occurred while running app-publisher: %O", error);
        }
    }
}


async function callFail(context, plugins, err)
{
    const errors = util.extractErrors(err).filter(err => err.semanticRelease);
    if (errors.length > 0)
    {
        try
        {
            await plugins.fail({ ...context, errors });
        } catch (error)
        {
            logErrors(context, error);
        }
    }
}


export = async (opts = {}, { cwd = process.cwd(), env = process.env, stdout = undefined, stderr = undefined } = {}) =>
{
    const { unhook } = hookStd(
        { silent: false, streams: [process.stdout, process.stderr, stdout, stderr].filter(Boolean) },
        hideSensitive(env)
    );

    const context = { cwd, env, stdout: stdout || process.stdout, stderr: stderr || process.stderr, logger: undefined, options: undefined };
    context.logger = getLogger(context);

    try
    {
        const { plugins, options } = await getConfig(context, opts);
        context.options = options;
        try
        {
            const result = await run(context, plugins);
            unhook();
            return result;
        }
        catch (error)
        {
            await callFail(context, plugins, error);
            throw error;
        }
    }
    catch (error)
    {
        logErrors(context, error);
        unhook();
        throw error;
    }
};
