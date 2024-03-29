import { escapeRegExp, last, template } from "lodash";
import semver from "semver";
import pLocate from "p-locate";
import { getTags, isRefInHistory, getTagHead } from "./repo";
import { IContext, IRelease, IVersionInfo } from "../interface";
import { EOL } from "os";
import { isNumeric } from "./utils/utils";
import { version } from "webpack";

export = getLastRelease;

/**
 * Last release.
 *
 * @typedef {Object} LastRelease
 * @property {string} version The version number of the last release.
 * @property {string} [head] The Git reference used to make the last release.
 */

/**
 * Determine the Git tag and version of the last tagged release.
 *
 * - Obtain all the tags referencing commits in the current branch history
 * - Filter out the ones that are not valid semantic version or doesn't match the `tagFormat`
 * - Sort the versions
 * - Retrieve the highest version
 *
 * @param context app-publisher context.
 *
 * @return {Promise<LastRelease>} The last tagged release or `undefined` if none is found.
 */
async function getLastRelease(context: IContext, lastVersionInfo: IVersionInfo): Promise<IRelease>
{
    let lastProdVersion: string | undefined,
        isProd: boolean;
    const { options, logger } = context;

    const isValid = (tag: any) =>
    {
        if (!tag || !tag.version) { return false; }

        const v = tag.version;
        tag.pre = false;

        if (lastVersionInfo.system !== "incremental")
        {
            const cv = semver.clean(v);
            isProd = !semver.prerelease(cv);
            if (isProd)
            {
                if (!lastProdVersion)
                {
                    lastProdVersion = cv;
                }
                else {
                    if (semver.rcompare(lastProdVersion, cv) > 0) {
                        lastProdVersion = cv;
                    }
                }
            }
            tag.pre = !isProd;
            return semver.valid(cv) && (options.versionPreReleaseId || isProd);
        }
        else if (isNumeric(v)) // incremental versioning
        {
            if (!lastProdVersion)
            {
                lastProdVersion = v;
            }
            else {
                if (parseInt(lastProdVersion) < parseInt(v)) {
                    lastProdVersion = v;
                }
            }
            return true;
        }

        return false;
    };

    const doSort = (a: any, b: any) =>
    {
        if (lastVersionInfo.system !== "incremental") {
            return semver.rcompare(a.version, b.version);
        }
        return a.version === b.version ? 0 : (parseInt(a.version) > parseInt(b.version) ? -1 : 1);
    };

    //
    // Generate a regex to parse tags formatted with `tagFormat`
    // by replacing the `version` variable in the template by `(.+)`.
    // The `tagFormat` is compiled with space as the `version` as it's an invalid tag character,
    // so it's guaranteed to not be present in the `tagFormat`.
    //
    // deepcode ignore GlobalReplacementRegex: only want one replacement
    const tagRegexp = `^${escapeRegExp(template(options.tagFormat)({ version: " " })).replace(" ", "(.+)")}`,
          tagsRaw = await getTags(context),
          tags = tagsRaw
                 .map((tag: any) => ({ tag, version: (tag.match(tagRegexp) || new Array(2))[1] }))
                 .filter((tag: any) => isValid(tag))
                 .sort(doSort);

    if (options.verbose) {
        context.stdout.write("Tags:" + EOL + JSON.stringify(tags, undefined, 2) + EOL);
    }

    const tag: any = await pLocate(tags, async (tag: any) => isRefInHistory(context, tag.tag, true, tag.pre), { preserveOrder: true });

    if (tag) {
        logger.info(`Found ${options.repoType} tag ${tag.tag} associated with version ${tag.version}`);
        if (options.versionPreReleaseId) {
            logger.info(`   Last production version is ${lastProdVersion}`);
        }
        return { head: await getTagHead(context, tag.tag), versionInfo: lastVersionInfo, lastProdVersion, ...tag };
    }

    logger.info(`No ${options.repoType} tag found that matches v${lastVersionInfo.version} extracted from local files`);
    return {
        head: undefined,
        tag: undefined,
        version: undefined,
        lastProdVersion: undefined,
        versionInfo: lastVersionInfo
    };
}
