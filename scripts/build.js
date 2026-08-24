const esbuild = require("esbuild");

async function build() {
  await esbuild.build({
    entryPoints: ["src/app.js"],
    outfile: "public/app.js",
    bundle: false,
    minify: true,
    target: "es2019",
  });

  await esbuild.build({
    entryPoints: ["src/style.css"],
    outfile: "public/style.css",
    bundle: false,
    minify: true,
  });

  console.log("Build klaar: public/app.js en public/style.css zijn geminified.");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
