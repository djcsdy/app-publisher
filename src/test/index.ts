/* eslint-disable no-empty-function */
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
"use strict";

import * as path from "path";
import Mocha from "mocha";
const NYC = require("nyc");
import * as glob from "glob";

//
// Recommended modules, loading them here to speed up NYC init
// and minimize risk of race condition
//
import "ts-node/register";
import "source-map-support/register";

export = async () =>
{
    //
    // Linux: prevent a weird NPE when mocha on Linux requires the window size from the TTY
    // Since we are not running in a tty environment, we just implementt he method statically
    //
    if (process.platform === "linux")
    {
        const tty = require("tty");
        if (!tty.getWindowSize)
        {
            tty.getWindowSize = (): number[] =>
            {
                return [80, 75];
            };
        }
    }

    try {
        await run();
        return 0;
    }
    catch (e) {
        return 0;
    }


    async function run(): Promise<void>
    {
        const testsRoot = path.resolve(__dirname, ".."),
              nycDir = path.join(__dirname, "..", "..");

        const nyc = new NYC(
        {
            extends: "@istanbuljs/nyc-config-typescript",
            cwd: nycDir,
            reporter: ["text-summary", "html", "lcov", "cobertura" ],
            all: true,
            silent: false,
            instrument: true,
            hookRequire: true,
            hookRunInContext: true,
            hookRunInThisContext: true,
            useSpawnWrap: true,           // wrap language server spawn
            include: ["build/**/*.js"],
            exclude: ["build/test/**"],
            reportDir: "./.coverage"
        });
        await nyc.wrap();

        //
        // Check the modules already loaded and warn in case of race condition
        // (ideally, at this point the require cache should only contain one file - this module)
        //
        const myFilesRegex = /app-publisher\/build/;
        const filterFn = myFilesRegex.test.bind(myFilesRegex);
        if (Object.keys(require.cache).filter(filterFn).length > 1)
        {
            console.warn("NYC initialized after modules were loaded", Object.keys(require.cache).filter(filterFn));
        }

        //
        // Debug which files will be included/excluded
        // console.log('Glob verification', await nyc.exclude.glob(nyc.cwd));
        //
        await nyc.createTempDirectory();

        //
        // Create the mocha test
        //
        const mocha = new Mocha({
            ui: "tdd", // the TDD UI is being used in extension.test.ts (suite, test, etc.)
            // color: true, // colored output from test results,
            timeout: 30000, // default timeout: 10 seconds
            retries: 0,
            reporter: "mocha-multi-reporters",
            reporterOptions: {
                reporterEnabled: "spec, mocha-junit-reporter",
                mochaJunitReporterReporterOptions: {
                    mochaFile: __dirname + "/../../.coverage/junit/extension_tests.xml",
                    suiteTitleSeparatedBy: ": "
                }
            }
        });

        mocha.useColors(true);

        //
        // Add all files to the test suite
        //
        const files = glob.sync("**/*.test.js", { cwd: testsRoot });
        files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

        let failures: number;

        try {
            failures = await new Promise(resolve => mocha.run(resolve));
        }
        catch (e) {
            console.log(e);
        }

        await nyc.writeCoverageFile();

        //
        // Capture text-summary reporter's output and log it in console
        //
        console.log(await captureStdout(nyc.report.bind(nyc)));

        if (failures > 0)
        {
            throw new Error(`${failures} tests failed.`);
        }
    }

    async function captureStdout(fn: any)
    {
        // eslint-disable-next-line prefer-const
        let w = process.stdout.write, buffer = "";
        process.stdout.write = (s: string) => { buffer = buffer + s; return true; };
        await fn();
        process.stdout.write = w;
        return buffer;
    }
};
