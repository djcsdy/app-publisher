
import * as path from "path";
import { getDotNetVersion, getDotNetFiles } from "./dotnet";
import { getIncrementalVersion } from "./incremental";
import { getMantisBtVersion } from "./mantisbt";
import { getPomVersion } from "./pom";
import { isString } from "../utils/utils";
import { pathExists } from "../utils/fs";
import { IVersionInfo } from "../../interface";


export = getCurrentVersion;


async function getCurrentVersion(context: any): Promise<IVersionInfo>
{
    const options = context.options,
          logger = context.logger,
          cwd = context.cwd;

    let versionInfo = {
        version: undefined,
        versionSystem: "semver",
        versionInfo: undefined
    };

    //
    // If node_modules dir exists, use package.json to obtain cur version
    //
    if (await pathExists("package.json"))
    {
        versionInfo.version = require(path.join(cwd, "package.json")).version;
    }
    //
    // Maven pom.xml based Plugin
    //
    else if (await pathExists("pom.xml"))
    {
        versionInfo = await getPomVersion(context);
    }
    //
    // MantisBT Plugin
    // The 'mantisbtPlugin' option specifies the main class file, containing version #
    //
    else if (options.mantisbtPlugin && await pathExists(options.mantisbtPlugin))
    {
        versionInfo = await getMantisBtVersion(context);
    }
    //
    // .NET with AssemblyInfo.cs file
    //
    else if ((await getDotNetFiles(logger)).length > 0)
    {
        versionInfo = await getDotNetVersion(context);
    }
    //
    // Test style History file
    //
    else if (options.historyFile && await pathExists(options.historyFile))
    {
        versionInfo = await getIncrementalVersion(context);
    }

    //
    // Check .publishrc if no version was found
    //
    if ((!versionInfo || !versionInfo.version) && options.version)
    {
        versionInfo = {
            version: options.version,
            versionSystem: "semver",
            versionInfo: undefined
        };
    }

    if (!versionInfo || !versionInfo.version)
    {
        logger.error("The current version cannot be determined from the local files");
    }
    else {
        logger.log("Retrieved local file version info");
        logger.log(`   Version   : ${versionInfo.version}`);
        logger.log(`   System    : ${versionInfo.versionSystem}`);
        logger.log(`   Xtra info : ${versionInfo.versionInfo}`);
    }

    return versionInfo;
}
