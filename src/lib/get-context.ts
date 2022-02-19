import { IContext, IOptions } from "../interface";
import getConfig from "./get-config";
import getLogger from "./get-logger";

export = getContext;


async function getContext(opts: IOptions, cwd: string, env: any, stdout: any, stderr: any): Promise<IContext>
{
    const context: IContext = {
        commits: undefined,
        changelog: undefined,
        cwd,
        env,
        logger: undefined,
        options: undefined,
        lastRelease: undefined,
        nextRelease: undefined,
        packageJsonModified: false,
        stdout: stdout || process.stdout,
        stderr: stderr || process.stderr
    };

    context.options = await getConfig(context, opts);
    context.logger = getLogger(context);

    return context;
}
