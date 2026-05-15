import fs from "fs";
import path from "path";

const CACHE_PATH =
  path.join(
    process.cwd(),
    "data",
    "inventory-cache.json"
  );

export function readInventoryCache() {

  try {

    console.log(
      "READ CACHE:",
      CACHE_PATH
    );

    if (!fs.existsSync(CACHE_PATH)) {

      console.log(
        "CACHE NOT FOUND"
      );

      return null;

    }

    const raw =
      fs.readFileSync(
        CACHE_PATH,
        "utf-8"
      );

    console.log(
      "CACHE LOADED"
    );

    return JSON.parse(raw);

  } catch (err) {

    console.error(
      "CACHE READ ERROR:",
      err
    );

    return null;

  }

}

export function writeInventoryCache(
  data: any
) {

  try {

    console.log(
      "WRITING CACHE..."
    );

    fs.mkdirSync(
      path.dirname(CACHE_PATH),
      {
        recursive: true
      }
    );

    fs.writeFileSync(

      CACHE_PATH,

      JSON.stringify(
        data,
        null,
        2
      ),

      "utf-8"

    );

    console.log(
      "CACHE WRITTEN"
    );

  } catch (err) {

    console.error(
      "CACHE WRITE ERROR:",
      err
    );

  }

}