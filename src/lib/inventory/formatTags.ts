export function formatTags(
  tags?: Record<string, string>
): string[] {

  if (
    !tags ||
    Object.keys(tags).length === 0
  ) {

    return ["Sin tags"];

  }

  const priorityKeys = [

    "cliente",
    "proyecto",
    "environment",
    "env",
    "owner",
    "application"

  ];

  const formatted: string[] = [];

  for (const key of priorityKeys) {

    const value =

      tags[key] ||
      tags[key.toUpperCase()] ||
      tags[key.toLowerCase()];

    if (
      value &&
      value.trim() !== ""
    ) {

      formatted.push(
        `${key}: ${value}`
      );

    }

  }

  if (formatted.length > 0) {

    return formatted;

  }

  return Object.entries(tags)
    .slice(0, 3)
    .map(

      ([k, v]) => `${k}: ${v}`

    );

}