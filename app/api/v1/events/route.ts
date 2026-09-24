// API pública — referência dos eventos de webhook e da assinatura.

import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@wa/lib/api-keys";
import { EVENT_TYPES } from "@wa/lib/events";
import { apiError } from "@wa/lib/public-api";

export async function GET(req: NextRequest) {
  try {
    await requireApiKey(req);
    return NextResponse.json({
      events: EVENT_TYPES,
      delivery: {
        method: "POST",
        headers: {
          "X-CNV-Event": "nome do evento",
          "X-CNV-Delivery": "id da entrega (para deduplicar)",
          "X-CNV-Signature": "sha256=HMAC-SHA256(segredo do endpoint, corpo bruto)",
        },
        body: {
          id: "id da entrega",
          event: "cadastro.criado",
          createdAt: "ISO 8601",
          data: { conversation: {}, contact: {}, target: {}, "…": "campos do evento" },
        },
        retries: "1 min, 5 min, 30 min, 2 h — depois marca como falha",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
