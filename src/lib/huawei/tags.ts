import {
  huaweiRequest
} from "./auth";

export async function getHuaweiTags({

  host,

  uri

}: {

  host: string;

  uri: string;

}) {

  try {

    const data =
      await huaweiRequest({

        method: "GET",

        host,

        uri

      });

    if (!data) {

      return {};

    }

    const tags =
      data.tags || [];

    const formatted: Record<string, string> = {};

    for (const tag of tags) {

      // VPC usa values[]
      if (
        Array.isArray(tag.values)
      ) {

        formatted[tag.key] =
          tag.values.join(",");

      }

      // ECS/RDS/Subnet usan value
      else {

        formatted[tag.key] =
          tag.value;

      }

    }

    return formatted;

  } catch (error) {

    console.error(
      "HUAWEI TAG ERROR:",
      error
    );

    return {};

  }

}