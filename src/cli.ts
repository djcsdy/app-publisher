#!/usr/bin/env node

import { env, stderr } from "process"; // eslint-disable-line node/prefer-global/process
import * as util from "util";
import hideSensitive = require("./lib/hide-sensitive");
import gradient from "gradient-string";
import chalk from "chalk";
import { publishRcOpts } from "./args";


export = async () =>
{
    const version = require("../package.json").version,
          banner = apBanner(version),
          ArgParser = require("@spmeesseman/arg-parser").ArgParser;

    const parser = new ArgParser({
        app: "app-publisher",
        banner, version,
        ignorePositional: [ "-p", "--profile" ]
    });
    const opts = parser.parseArgs(publishRcOpts);

    //
    // Set task mode stdout flag on the options object
    //
    opts.taskModeStdOut = !!(opts.taskVersionCurrent || opts.taskVersionNext || opts.taskVersionInfo ||
                             opts.taskCiEvInfo || opts.taskVersionPreReleaseId);

    try {  //
          // Display color banner
         // If opts.verbose s set, then the ArgumentParser will have diplayed the banner already
        // For stdout type tasks, then we dont display the banner or anything else for that matter.
        //
        if (!opts.taskModeStdOut && !opts.verbose) {
            displayIntro(banner);
        }

        await require(".")(opts);
        return 0;
    }
    catch (error)
    {
        if (error.name !== "YError") {
            stderr.write(hideSensitive(env)(util.inspect(error, {colors: true})));
    }

    return 1;
  }
};

function apBanner(version: string)
{
    return `                                       _      _       _
  _ _ __ _ __   _ __      _ __  _   __| |_ | (_)_____| |  ____  ____
 / _\\' || '_ \\\\| '_ \\\\___| '_ \\\\| \\ \\ |  _\\| | || ___| \\_/ _ \\\\/  _|
 | (_| || |_) || |_) |___| |_) || |_| | |_)| | | \\\\__| __ | __/| |
 \\__\\\\__| | .//| | .//   | | .//|____/|___/|_|_|/___/|_| \\___|.|_| v${version}
        |_|    |_|       |_|`;
}

function displayIntro(banner)
{
    console.log(chalk.bold(gradient("cyan", "pink").multiline(banner, {interpolation: "hsv"})));
}
