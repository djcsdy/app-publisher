
import semver from "semver";
import { IContext, IVersionInfo } from "../../interface";
import { getVersionSystem } from "../utils/utils";


export async function getChangelogVersion(context: IContext): Promise<IVersionInfo>
{
    let versionSystem: "auto" | "semver" | "incremental";
    const version = await context.changelog.getVersion(context);
    return { version, system: getVersionSystem(version), info: undefined };
}
