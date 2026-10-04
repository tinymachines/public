import { lessons, parts, program, romName } from "@/lib/lessons";

/**
 * A lesson's cartridge (<key>.nes), its program (<key>.s), and its parts
 * for the desk to build it in the page (<key>.parts.json: the program, the
 * tiles and the board), served from the record and the lesson's own
 * directory. Static: the files exist at build.
 */

export const dynamic = "force-static";

export function generateStaticParams() {
  return lessons().flatMap((l) => [{ file: romName(l.key) }, { file: `${l.key}.s` }, { file: `${l.key}.parts.json` }]);
}

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  for (const l of lessons()) {
    if (file === romName(l.key)) {
      return new Response(Buffer.from(l.rom, "base64"), { headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${file}"` } });
    }
    if (file === `${l.key}.parts.json`) {
      return Response.json(parts(l.key));
    }
    if (file === `${l.key}.s`) {
      return new Response(program(l.key), { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
  }
  return new Response("no such lesson file\n", { status: 404 });
}
