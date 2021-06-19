
import { readFile } from "../utils";

export = getMantisVersion;


async function getMantisVersion({logger, options}): Promise<{ version: string, versionSystem: string, versionInfo: any }>
{
    let version = "";
    logger.log("Retrieving MantisBT plugin version from $MANTISBTPLUGIN");

    const fileContent = await readFile(options.mantisBtPlugin),
            regexp = new RegExp("this->version[ ]*=[ ]*(\"|')[0-9]+[.]{1}[0-9]+[.]{1}[0-9]+", "gm"),
            found = fileContent.match(regexp);
    if (found)
    {
            version = found[0].replace("this->version", "");
            version = version.replace(" ", "");
            version = version.replace("=", "");
            version = version.replace("\"", "");
            version = version.replace("'", "");
    }

    return { version, versionSystem: "semver", versionInfo: undefined };
}
