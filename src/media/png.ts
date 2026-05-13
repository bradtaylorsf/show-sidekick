import { deflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = makeCrcTable();

export type RgbaPng = {
  width: number;
  height: number;
  data: Uint8Array;
};

export function encodeRgbaPng(image: RgbaPng): Buffer {
  if (image.width <= 0 || image.height <= 0 || !Number.isInteger(image.width) || !Number.isInteger(image.height)) {
    throw new Error("PNG width and height must be positive integers");
  }

  if (image.data.length !== image.width * image.height * 4) {
    throw new Error("PNG RGBA data length does not match dimensions");
  }

  const raw = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rawOffset = y * (image.width * 4 + 1);
    const dataOffset = y * image.width * 4;
    raw[rawOffset] = 0;
    Buffer.from(image.data.buffer, image.data.byteOffset + dataOffset, image.width * 4).copy(raw, rawOffset + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);

  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);

  return output;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable(): number[] {
  const table: number[] = [];

  for (let n = 0; n < 256; n += 1) {
    let crc = n;
    for (let k = 0; k < 8; k += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[n] = crc >>> 0;
  }

  return table;
}
