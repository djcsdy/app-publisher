
import glob = require("glob");
import { replaceInFile, readFile, editFile } from "../utils";


async function getFiles(logger)
{
    return new Promise<string[]>((resolve, reject) => {
        glob("**/assemblyinfo.cs", { nocase: true }, (err, files) =>
        {
            if (err) {
                logger.error("Error tring to find assemblyinfo.cs files");
                reject(err);
            } else {
                resolve(files);
            }
        });
    });
}


export async function getDotNetVersion({logger}): Promise<{ version: string, versionSystem: string, versionInfo: any }>
{
    let version = "";
    const fileNames = await getFiles(logger);

    logger.log("Retrieving assemblyinfo version from $AssemblyInfoLocation");

    if (fileNames && fileNames.length === 1)
    {
        const fileContent = await readFile(fileNames[0]),
            regexp = new RegExp("AssemblyVersion[ ]*[(][ ]*[\"][0-9]+[.]{1}[0-9]+[.]{1}[0-9]+", "gm"),
            found = fileContent.match(regexp);
        if (found)
        {
            version = found[0].replace("AssemblyVersion", "");
            version = version.replace(" ", "");
            version = version.replace("(", "");
            version = version.replace("\"", "");
            // Rid build number
            version = version.substring(0, version.lastIndexOf("."));
        }
    }
    else if (fileNames && fileNames.length > 0) {
        logger.error("The current version cannot be determined, multiple assemblyinfo files found");
    }
    else {
        logger.error("The current version cannot be determined");
    }

    return { version, versionSystem: ".net", versionInfo: undefined };
}


export async function setDotNetVersion({nextRelease, options, logger})
{
    let semVersion = "";
    const fileNames = await getFiles(logger);

    if (fileNames && fileNames.length === 1)
    {
        if (!nextRelease.version.Contains("."))
        {
            for (const c of nextRelease.version) {
                semVersion = `${semVersion}${c}.`;
            }
            semVersion = semVersion.substring(0, semVersion.length - 1);
        }
        else {
            semVersion = nextRelease.version;
        }
        //
        // Replace version in assemblyinfo file
        //
        await replaceInFile("pom.xml", `AssemblyVersion[ ]*[\\(][ ]*["][0-9a-z.]+`, `AssemblyVersion("${semVersion}`);
        //
        // Allow manual modifications to mantisbt main plugin file and commit to modified list
        //
        editFile({options}, "pom.xml", false, (options.skipVersionEdits === " Y" || options.taskTouchVersions));
    }
    else if (fileNames && fileNames.length > 0) {
        logger.error("The current version cannot be written, multiple assemblyinfo files found");
    }
    else {
        logger.error("The current version cannot be written");
    }
}