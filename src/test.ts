// import { properCase } from "./lib/utils/utils";
// import * as path from "path";
// import * as semver from "semver";
import { IContext } from "./interface";
import { escapeShellString } from "./lib/utils/utils";
// import { setNpmVersion } from "./lib/version/npm";

export = runDevCodeTests;

//
// Run with --task-dev-test
//
function runDevCodeTests(context: IContext)
{
    // console.log("1");
    // const cmd = context.options.deployPostCommand as string;
    // console.log("cmd: " + cmd[0]);
    // const cmd2 = escapeShellString(false, cmd[0]) as string[];
    // console.log(cmd2.length);
    // console.log("cmd2: " + cmd2.join(" , "));
    // const cmd3 = escapeShellString(true, cmd[0]) as string;
    // console.log("3: " + cmd3);

    // console.log(semver.prerelease("2.0.2-pre.0"));
    // setNpmVersion(context);
    // console.log(properCase("fixes"));
    // let msg = "ApiExtend is an Api[skip ci] that [skip ci] ApiUser [prod-release] the with [sandbox release] Api ExtendApi. [nightly-release]";
    // msg = msg.replace(/(?<!\w)(?:Api|Npm|Sso|Svn|Html?)(?= |$|\.)/gm, (m, args): string =>
    // {
    //     return m.toUpperCase();
    // })
    // .replace(/[ ]*\[(?:skip[ \-]{1}ci|[a-z]+[ \-]{1}release)\]/gmi, (m, args): string =>
    // {
    //     return "";
    // });
    // console.log(msg);
    // const edits = [{
    //     path: "src/test.txt",
    //     type: "M"
    // },
    // {
    //     path: "dist/install.com",
    //     type: "A"
    // },
    // {
    //     path: "install/dist/installer.msi",
    //     type: "M"
    // }];
    // const changeListAdd: string = edits.filter((e: any) => e.type === "A").map((e: any) => e.path).join(" ").trim(),
    //       changeListModify: string = edits.filter((e: any) => e.type === "M").map((e: any) => e.path).join(" ").trim();
    // console.log(1, changeListAdd);
    // console.log(2, changeListModify);

//     const stdout = `.gitattributes
// .gitignore
// .publishrc.spm.json
// .releaserc.json
// CHANGELOG.md
// README.spm.json
// README.spmeesseman.md
// ap.env
// azure-pipelines.yml
// build
// node_modules
// package.spm.json
// package.spmeesseman.json`;

    // const excapedRegex = util.escapeRegExp("^.publishrc.spm.json$");
    // console.log(1, new RegExp(`^${excapedRegex}$`, "gm").test(stdout));
    // console.log(2, new RegExp(`^.publishrc.spm.json$`, "gm").test(stdout));
    // console.log(3, new RegExp(`^\\\\.publishrc\\\\.spm\\\\.json$`, "gm").test(stdout));
    // console.log(1, new RegExp(`node_modules$`, "gm").test(stdout));
}
