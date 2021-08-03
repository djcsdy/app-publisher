
import * as semver from "semver";
import { IContext, IVersionInfo } from "../../interface";
import { FIRST_RELEASE, FIRST_RELEASE_INC } from "../definitions/constants";


export function getNextVersion(context: IContext)
{
    const {nextRelease, lastRelease, options, logger} = context;
    let version: string,
        lastVersion = lastRelease.version;

    logger.log("Get next version");
    logger.log("   Level  : " + nextRelease.level);

    if (!lastVersion && lastRelease.versionInfo.version) {
        lastVersion = lastRelease.versionInfo.version;
        logger.log("   There is no previous release tag found to detrmine the next version");
        logger.log(`   Set last version from local files: ${lastVersion}`);
    }

    if (lastVersion)
    {
        if (lastRelease.versionInfo.system === "incremental")
        {
            version = (parseInt(lastVersion) + 1).toString();
        }
        else {
            if (!options.versionPreReleaseId) {
                version = semver.inc(lastVersion, nextRelease.level);
            }
            else {
            // if (options.versionPreReleaseId) {
                let lvl: "prepatch" | "preminor" | "premajor" | "prerelease" = "prerelease";
                if (semver.prerelease(lastVersion) === null) {
                    lvl = ("pre" + nextRelease.level) as "prepatch" | "preminor" | "premajor"; // | "prerelease"
                }
                logger.log("   Pre Id : " + options.versionPreReleaseId);
                version = semver.inc(lastVersion, lvl, options.versionPreReleaseId);
            }
            logger.log(`The next version is ${version}`);
        }
    }
    else {
        if (lastRelease.versionInfo.system === "incremental") {
            version = FIRST_RELEASE_INC;
        }
        else {
            version = FIRST_RELEASE;
        }
        logger.log(`There is no previous release, the next version is ${version}`);
    }

    const lrVersionInfo = lastRelease.versionInfo.info ? [ ...lastRelease.versionInfo.info ] : undefined;

    return {
        version,
        info: lrVersionInfo,
        system: lastRelease.versionInfo.system
     } as IVersionInfo;
}
