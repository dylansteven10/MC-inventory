export function formatAwsTags(

  tags: any[] = []

) {

  const formatted: Record<string, string> = {};

  for (const tag of tags) {

    if (

      tag.Key &&
      tag.Value

    ) {

      formatted[tag.Key] =
        tag.Value;

    }

  }

  return formatted;

}