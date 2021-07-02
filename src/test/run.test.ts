/* eslint-disable no-unused-expressions */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from "chai";
import { getApOptions, runApTest, sleep } from "./helper";


suite("Full Run Tests", () =>
{

    test("dry run full", async () =>
    {
        let options = await getApOptions([ "--dry-run", "--skip-changelog-edits", "--skip-version-edits" ]);
        expect(await runApTest(options)).to.equal(0, "task: full dry run");
        sleep(500);

        options = await getApOptions([ "--config-name", "pja" ]);
        // expect(await runApTest(options)).to.equal(0, "task: full dry run cst config");
        // sleep(500);
    }).timeout(120000);

});