/** Publish the built visualizer to the gh-pages branch (post-event, deliberate act —
 *  raw results/ stay gitignored; only the exported public/data bundle ships).
 *  Usage: pnpm --filter @skillcraft/playback deploy   (after export:data + build) */
import ghPages from "gh-pages";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist", import.meta.url));

ghPages.publish(
  dist,
  {
    branch: "gh-pages",
    message: "deploy skillcraft playback visualizer",
    dotfiles: false,
  },
  (err) => {
    if (err) {
      console.error(`gh-pages publish failed: ${err.message ?? err}`);
      process.exit(1);
    }
    console.log("published dist/ to gh-pages branch");
  },
);
