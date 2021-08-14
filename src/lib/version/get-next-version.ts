
import * as semver from "semver";
import { IContext, IVersionInfo } from "../../interface";
import { FIRST_RELEASE, FIRST_RELEASE_INC } from "../definitions/constants";


export function getNextVersion(context: IContext)
{
    const {nextRelease, lastRelease, options, logger} = context,
          lastProdVersion = lastRelease.lastProdVersion;
    let version: string,
        lastVersion = lastRelease.version;

    logger.log("Get next version");
    logger.log("   Level  : " + nextRelease.level);

    if (!lastVersion && lastRelease.versionInfo.version)
    {
        lastVersion = lastRelease.versionInfo.version;
        logger.log("   There is no previous release tag found to determine the next version");
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
                let lvl: string; // "prepatch" | "preminor" | "premajor" | "prerelease" = "prerelease";
                if (semver.prerelease(lastVersion) === null)
                {
                    lvl = ("pre" + nextRelease.level); // as "prepatch" | "preminor" | "premajor"; // | "prerelease"
                }
                else {
                    lvl = "pre" + nextRelease.level; // as "prepatch" | "preminor" | "premajor";
                    if (lvl === "prepatch") { // we only want prepatch when bumping a non-pre-release version
                        lvl = "prerelease";   // we continue to use prerelease to bump the prerelease # and
                    }                         // not the patch version #.
                }
                logger.log("   Pre Id : " + options.versionPreReleaseId);
                version = semver.inc(lastVersion, lvl as semver.ReleaseType, options.versionPreReleaseId);
                //
                // When incrementing pre-release versions, make sure each version level does not exceed one
                // increment away from the last production version.
                //
                logger.log("   Check pre-release version is within one inc of prod version at all levels");
                lvl = lvl.replace("pre", "");
                const nextProd = semver.inc(lastProdVersion, lvl as semver.ReleaseType);
                if (semver.rcompare(nextProd, version) < 0)
                {
                    logger.log("      Reset release type to 'prerelease'");
                    version = semver.inc(lastVersion, "prerelease", options.versionPreReleaseId);
                }
            }
        }

        logger.log(`The next version is ${version}`);
    }
    else {
        if (lastRelease.versionInfo.system === "incremental")
        {
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
