#!/usr/bin/env node

import { visit, JSONVisitor } from 'jsonc-parser';
import { CommitAnalyzer } from './lib/commit-analyzer';
import * as util from './util';
import * as fs from 'fs';
import * as path from 'path';
import * as gradient from 'gradient-string';
import chalk from 'chalk';
import * as child_process from 'child_process';

//
// Display color banner
//
displayIntro();

let version = require('../package.json').version;

//
// Build command line argument parser
//
var ArgumentParser = require('argparse').ArgumentParser;
var parser = new ArgumentParser({
    addHelp: false,
    description: '',
    prog: 'app-publisher'
});
parser.addArgument(
    '--dry-run',
    {
        dest: 'dryRun',
        action: 'storeTrue',
        help: 'Run the publisher chain in dry/test mode and exit.'
    }
);
parser.addArgument(
    [ '-h', '--help' ],
    {
        help: 'Display help and exit.',
        action: 'storeTrue'
    }
);
parser.addArgument(
    [ '-p', '--profile' ],
    {
        help: 'The publish profile to use.',
        choices: [ 'node', 'ps' ],
        defaultValue: 'node'
    }
);
parser.addArgument(
    '--read-config',
    {
        dest: 'readConfig',
        action: 'storeTrue',
        help: 'Display the contents of the configuration file end exit.'
    }
);
parser.addArgument(
    '--verbose',
    {
        action: 'storeTrue',
        help: 'Increase logging verbosity.'
    }
);
parser.addArgument(
    '--version',
    {
        help: 'Display version and exit.',
        action: 'storeTrue'
    }
);

//
// Parse command line arguments
//
let args = parser.parseArgs();

//
// If user specified '-h' or --help', then just display help and exit
//
if (args.help)
{
    util.log(gradient('cyan', 'pink').multiline(`----------------------------------------------------------------------------
 App-Publisher Help
----------------------------------------------------------------------------
`, {interpolation: 'hsv'}));
    parser.printHelp();
    process.exit(0);
}

//
// If user specified '--version', then just display version and exit
//
if (args.version)
{
    util.log(chalk.bold(gradient('cyan', 'pink').multiline(`----------------------------------------------------------------------------
 App-Publisher Version
----------------------------------------------------------------------------
`, {interpolation: 'hsv'})));
    util.log(version);
    process.exit(0);
}

//
// Read config file:
//
//     .publishrc.json
//     .publishrc
//
let fileCfg;
if (fs.existsSync('.publishrc.json')) {
    fileCfg = fs.readFileSync('.publishrc.json').toString();
}
else if (fs.existsSync('.publishrc')) {
    fileCfg = fs.readFileSync('.publishrc').toString();
}
else {
    util.logError("Config file not found!! Exiting");
    process.exit(80);
}

//
// Replace environment variables
//
// Environment variables in .publishconfig should be in the form:
//
//     ${VARIABLE_NAME}
//
for (var key in process.env) 
{
    var envVar = "[$][{]\\b" + key + "\\b[}]";
    fileCfg = fileCfg.replace(new RegExp(envVar), process.env[key].replace(/\\/, "\\\\"));
}

//
// If user specified '--read-config', then just display config and exit
//
if (args.readConfig)
{
    let title = `----------------------------------------------------------------------------
 Cofiguration file contents
----------------------------------------------------------------------------
    `;
    util.log(chalk.bold(gradient('cyan', 'pink').multiline(title, {interpolation: 'hsv'})));
    util.log(fileCfg);
    process.exit(0);
}


//
// Convert file config to JSON object
//
fileCfg = JSON.parse(fileCfg);

//
// Set dry run flags
//
let dryCfg = {
    testMode: args.dryRun ? "Y" : "N",
    testModeSvnRevert: args.dryRun ? "Y" : (fileCfg.testModeSvnRevert ? fileCfg.testModeSvnRevert : "N"),
    skipDeployPush: args.dryRun ? "Y" : (fileCfg.skipDeployPush ? fileCfg.skipDeployPush : "N")
};

//
// Merge configs
//
let config = { ...fileCfg, ...dryCfg };

let runCt = 0;
let reposCommited:Array<string> = [];
let runsCfg = [{}];

if (config.xRuns)
{
    //
    // Push the run config, use JSON.parse(JSON.stringify) to  clone the object so
    // we can then delete it
    //
    runsCfg.push(...JSON.parse(JSON.stringify(config.xRuns)));
    delete config.xRuns;
}

//
// Run publish
//
for (var run in runsCfg)
{
    runCt++;
    config = { ...config, ...runsCfg[run] };

    if (!args.profile || args.profile === "node") {
        //const commitAnalyzer = new CommitAnalyzer({});
        util.log('Generic publisher not yet implemented, use --profile=ps');
    }
    else if (args.profile === "ps") 
    {
        let sArgs = "";
        let cProperty: string;
        let aProperty: string;
        //
        // Format config for powershell script arguments
        //
        let visitor: JSONVisitor = 
        {
            onError() { cProperty = undefined; },
            onObjectEnd() 
            { 
                cProperty = undefined;
                aProperty = undefined;
            },
            onArrayBegin(offset: number, length: number, startLine: number, startCharacter: number)
            {
                let propStart = "-" + cProperty.toUpperCase() + " ";
                aProperty = cProperty;
                if (sArgs.includes(propStart)) {
                    util.logError("Configuration parameter '" + cProperty + "' defined twice, check casing");
                    util.logError("   sArgs = " + sArgs);
                    process.exit(81);
                }
                sArgs += (propStart);
            },
            onArrayEnd(offset: number, length: number, startLine: number, startCharacter: number)
            {
                aProperty = undefined;
                if (sArgs.endsWith(",")) {
                    sArgs = sArgs.substring(0, sArgs.length - 1) + " ";
                } 
            },
            onLiteralValue(value: any, offset: number, _length: number) 
            {
                if (cProperty && typeof value === 'string') 
                {
                    if (!aProperty) 
                    {
                        let propStart = "-" + cProperty.toUpperCase() + " ";
                        if (sArgs.includes(propStart)) 
                        {
                            util.logError("   Configuration parameter '" + cProperty + "' defined twice, check casing");
                            util.logError("   sArgs = " + sArgs);
                            process.exit(82);
                        }
                        util.log("   Value: '" + value + "'");
                        sArgs += (propStart + "'" + value + "' ");
                    }
                    else {
                        util.log("   Adding array value: '" + value + "'");
                        sArgs += ("\"" + value + "\",");
                    }
                }
                else if (aProperty && typeof value === 'string')
                {
                    sArgs += ("'" + value + "',");
                }
                else if (cProperty && value)
                {
                    if (!aProperty)
                    {
                        let propStart = "-" + cProperty.toUpperCase() + " ";
                        if (sArgs.includes(propStart)) {
                            util.logError("   Configuration parameter '" + cProperty + "' defined twice, check casing");
                            util.logError("   sArgs = " + sArgs);
                            process.exit(83);
                        }
                        util.log("   Value: " + value.toString());
                        sArgs += (propStart + value + " ");
                    }
                    else {
                        sArgs += (value + ",");
                    }
                }
                cProperty = undefined;
            },
            onObjectProperty(property: string, offset: number, _length: number) 
            {
                util.log("Found configuration parameter '" + property + "'");
                cProperty = property;
            }
        };
        visit(JSON.stringify(config), visitor);

        //
        // Get the repository url if not specified
        //
        if (!config.repo) 
        {
            let cwd = process.cwd();
            let appPackageJson = path.join(cwd, 'package.json');
            if (fs.existsSync(appPackageJson)) {
                let repository = require(appPackageJson).repository;
                if (repository) 
                {
                    if (typeof repository === 'string') {
                        config.repo = repository;
                    }
                    else {
                        config.repo = repository.url;
                    }
                }
            }
            if (!config.repo)
            {
                util.logError("Repository url must be sepcified in .publishrc or package.json");
                process.exit(85);
            }
        }

        //
        // Get the repository type if not specified
        //
        if (!config.repoType) 
        {
            let cwd = process.cwd();
            let appPackageJson = path.join(cwd, 'package.json');
            if (fs.existsSync(appPackageJson)) {
                let repository = require(appPackageJson).repository;
                if (repository) {
                    if (typeof repository === 'object') {
                        config.repoType = repository.type;
                    }
                }
            }
            if (!config.repoType)
            {
                util.logError("Repository type must be sepcified in .publishrc or package.json");
                util.logError("   Possible values:  svn, git");
                process.exit(85);
            }
            else if (config.repoType !== 'svn' && config.repoType !== 'git') 
            {
                util.logError("Invalid repository type sepcified, must be 'svn' or 'git'");
                process.exit(86);
            }
        }

        //
        // If this is a 2nd run (or more), and the repository is the same, then skip the comit
        //
        if (reposCommited.indexOf(config.repoType) >= 0) 
        {
            sArgs = sArgs + " -skipCommit Y";
            if (!sArgs.includes(" -vcTag N")) {
                sArgs = sArgs.replace(/-vcTag Y/gi, "");
                sArgs = sArgs + " -vcTag N";
            }
        }
        else {
            reposCommited.push(config.repoType);
        }

        sArgs = sArgs + ` -apppublisherversion ${version}`;
        sArgs = sArgs + ` -run ${runCt}`;

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
        var ps1Script;
        if (util.pathExists(".\\node_modules\\@spmeesseman\\app-publisher")) {
            ps1Script = ".\\node_modules\\@spmeesseman\\app-publisher\\script\\app-publisher.ps1";
        }
        else if (util.pathExists(".\\node_modules\\@perryjohnson\\app-publisher")) {
            ps1Script = ".\\node_modules\\@perryjohnson\\app-publisher\\script\\app-publisher.ps1";
        }
        else if (util.pathExists(".\\script\\app-publisher.ps1")) {
            ps1Script = ".\\script\\app-publisher.ps1";
        }
        else 
        {
            if (process.env.CODE_HOME)
            {
                // Check global node_modules
                //
                let gModuleDir = process.env.CODE_HOME + "\\nodejs\\node_modules";
                if (util.pathExists(gModuleDir + "\\@perryjohnson\\app-publisher\\script\\app-publisher.ps1")) {
                    ps1Script = gModuleDir + "\\@perryjohnson\\app-publisher\\script\\app-publisher.ps1";
                }
                else if (util.pathExists(gModuleDir + "\\@spmeesseman\\app-publisher\\script\\app-publisher.ps1")) {
                    ps1Script = gModuleDir + "\\@spmeesseman\\app-publisher\\script\\app-publisher.ps1";
                }
            }
            // Check windows install
            //
            else if (process.env.APP_PUBLISHER_HOME)
            {
                if (util.pathExists(process.env.APP_PUBLISHER_HOME + "\\app-publisher.ps1")) {
                    ps1Script = ".\\app-publisher.ps1";
                }
            }
        }

        if (!ps1Script) {
            util.logError("Could not find powershell script app-publisher.ps1");
            process.exit(102);
        }

        //
        // Launch Powershell script
        //
        child_process.spawnSync("powershell.exe", [`${ps1Script} ${sArgs}`], { stdio: 'inherit'});
        // let child = child_process.spawn("powershell.exe", [`${ps1Script} ${sArgs}`], { stdio: ['pipe', 'inherit', 'inherit'] });
        // process.stdin.on('data', function(data) {
        //     if (!child.killed) {
        //         child.stdin.write(data);
        //     }
        // });
        // child.on('exit', function(code) {
        //     process.exit(code);
        // });
    }
}

function displayIntro() 
{
    const title = `
                                       _      _       _
  _ _ __ _ __   _ __      _ __  _   __| |_ | (_)_____| |  ____  ____
 / _\\' || '_ \\\\| '_ \\\\___| '_ \\\\| \\ \\ |  _\\| | || ___| \\_/ _ \\\\/  _|
 | (_| || |_) || |_) |___| |_) || |_| | |_)| | | \\\\__| __ | __/| |
 \\__\\\\__| | .//| | .//   | | .//|____/|___/|_|_|/___/|_| \\___|.|_| v${require('../package.json').version} 
        |_|    |_|       |_|                                                    
    `;
    util.log(chalk.bold(gradient('cyan', 'pink').multiline(title, {interpolation: 'hsv'})));
}


function displayArgHelp(arg: string)
{
    util.log("projectname       Name of the project.  This must macth throughout the build");
    util.log("                  files and the SVN project name");
    util.log("");

    util.log("deployscript      ");
    util.log("");

    util.log("historyfile      The location of this history file, can be a relative or full path.");
    util.log("");

    util.log("historylinelen   Defaults to 80");
    util.log("");

    util.log("historyhdrfile   The location of this history header file, can be a relative or full path.");
    util.log("");

    util.log("historyfile      To build the installer release, set this flag to \"Y\"");
    util.log("");

    util.log("installerrelease  To build the installer release, set this flag to \"Y\"");
    util.log("");

    util.log("installerscript   The location of the installer build script, this can be a");
    util.log("                  relative to PATHTOROOT or a full path.");
    util.log("                  Note this parameter applies only to INSTALLRELEASE=\"Y\"");
    util.log("");

    util.log("notepadedits     ");
    util.log("");

    util.log("npmrelease       To build the npm release, set this flag to \"Y\"");
    util.log("");

    util.log("npmuser          NPM user (for NPMRELEASE=\"Y\" only)");
    util.log("                 NPM username, password, and token should be store as environment variables");
    util.log("                 for security.  The variable names should be:");
    util.log("                      PJ_NPM_USERNAME");
    util.log("                      PJ_NPM_PASSWORD");
    util.log("                      PJ_NPM_TOKEN");
    util.log("                 To create an npm user if you dont have one, run the following command and follow");
    util.log("                 the prompts:");
    util.log("                      $ npm adduser --registry=npm.development.pjats.com --scope=@perryjohnson");
    util.log("                      Locate the file [USERDIR]\.npmrc, copy the created token from within");
    util.log("                      the NPM environment variables as well.");
    util.log("");

    util.log("nugetrelease     To build the nuget release, set this flag to \"Y\"");
    util.log("");

    util.log("pathtoroot       A relative (not full) path that will equate to the project root as seen from the");
    util.log("                 script's location.  For example, if this script is in PROJECTDIR\\script, then");
    util.log("                 the rel path to root would be \"..\".  If the script is in PROJECTDIR\\install\\script,");
    util.log("                 then the rel path to root would be \"..\\..\"");
    util.log("                 The value should be relative to the script dir, dont use a full path as this will not");
    util.log("                 share across users well keeping project files in different directories");

    util.log("pathtomainroot  ");
    util.log("                 This in most cases sould be an empty string if the project is the 'main' project.  If");
    util.log("                 a sub-project exists within a main project in SVN, then this needs to be set to the ");
    util.log("                 relative directory to the main project root, as seen from the sub-project root.");
    util.log("");

    util.log("pathtodist       Path to DIST should be relative to PATHTOROOT");
    util.log("");

    util.log("pathpreroot      This in most cases sould be an empty string if the project is the 'main' project.  If");
    util.log("                 a sub-project exists within a main project in SVN, then this needs to be set to the");
    util.log("                 relative directory to the project path, as seen from the main project root.");
    util.log("                 ");
    util.log("                 For example, the following project contains a layout with 3 separate projects 'fp', 'ui', ");
    util.log("                 and 'svr':");
    util.log("                     GEMS2");
    util.log("                         app");
    util.log("                             fpc");
    util.log("                             svr");
    util.log("                             ui");
    util.log("                 The main project root is GEMS2.  In the case of each of these projects, SVNPREPATH should");
    util.log("                 be set to app\\fpc, app\\ui, or app\\svr, for each specific sub-project.");
    util.log("                 This mainly is be used for SVN commands which need to be ran in the directory containing");
    util.log("                 the .svn folder.");
    util.log("");

    util.log("skipdeploypush   Skip uploading installer to network release folder (primarily used for releasing");
    util.log("                 from hom office where two datacenters cannot be reached at the same time, in this");
    util.log("                 case the installer files are manually copied)");
    util.log("");

    util.log("svnrepo          The SVN repository.  It should be one of the following:");
    util.log("                     1. pja");
    util.log("                     2. pjr");
    util.log("");

    util.log("svnprotocol      The SVN protocol to use for SVN commands.  It should be one of the following:");
    util.log("                     1. svn");
    util.log("                     2. https");
    util.log("");

    util.log("svnserver        The svn server address, can be domain name or IP");
    util.log("");

    util.log("testmode         Test mode - Y for 'yes', N for 'no'");
    util.log("                 In test mode, the following holds:");
    util.log("                     1) Installer is not released/published");
    util.log("                     2) Email notification will be sent only to $TESTEMAILRECIPIENT");
    util.log("                     3) Commit package/build file changes (svn) are not made");
    util.log("                     4) Version tag (svn) is not made");
    util.log("                 Some local files may be changed in test mode (i.e. updated version numbers in build and");
    util.log("                 package files).  These changes should be reverted to original state via SCM");
    util.log("");

    util.log("testmodesvnrevert    ");
    util.log("");

    util.log("testemailrecipient    ");
    util.log("");

    util.log("versiontext      The text tag to use in the history file for preceding the version number.  It should ");
    util.log("                 be one of the following:");
    util.log("                 ");
    util.log("                     1. Version");
    util.log("                     2. Build");
    util.log("                     3. Release");
    util.log("");
}

