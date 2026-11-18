import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { getServerEnv, isRealCredential } from '@/lib/env';
import { GeminiFoodDetectionSchema, type FoodItemMatch } from '@/lib/schemas';
import { matchFoodComponentToDatabase } from '@/lib/nutrition-db';

const rateLimitWindowMs = 10 * 60 * 1000;
const maxRequestsPerWindow = 15;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(clientKey: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(clientKey);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(clientKey, { count: 1, resetAt: now + rateLimitWindowMs });
    return true;
  }
  if (entry.count >= maxRequestsPerWindow) {
    return false;
  }
  entry.count += 1;
  return true;
}

async function queryUsdaFdcIfConfigured(
  queryText: string,
  apiKey?: string
): Promise<{
  fdcId: string;
  description: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sodiumMg: number;
} | null> {
  if (!isRealCredential(apiKey)) return null;
  try {
    const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
    url.searchParams.set('api_key', apiKey!);
    url.searchParams.set('query', queryText);
    url.searchParams.set('pageSize', '1');
    url.searchParams.set('dataType', 'Foundation,SR Legacy');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(4500) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      foods?: Array<{
        fdcId: number;
        description: string;
        foodNutrients?: Array<{ nutrientNumber?: string; value?: number }>;
      }>;
    };
    const first = data.foods?.[0];
    if (!first || !first.foodNutrients) return null;

    const getNutrient = (num: string): number => {
      const found = first.foodNutrients?.find((n) => n.nutrientNumber === num);
      return typeof found?.value === 'number' ? found.value : 0;
    };

    return {
      fdcId: `usda_${first.fdcId}`,
      description: first.description,
      calories: getNutrient('208'),
      proteinG: getNutrient('203'),
      carbsG: getNutrient('205'),
      fatG: getNutrient('204'),
      fiberG: getNutrient('291'),
      sodiumMg: getNutrient('307'),
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const clientIp = req.headers.get('x-forwarded-for') ?? 'local_client';

  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      {
        error: 'Batas analisis AI tercapai (maksimal 15 foto per 10 menit). Silakan coba lagi beberapa saat atau gunakan input komponen manual.',
        code: 'RATE_LIMITED',
      },
      { status: 429 }
    );
  }

  const env = getServerEnv();
  if (!isRealCredential(env.GEMINI_API_KEY)) {
    return NextResponse.json(
      {
        error: 'GEMINI_API_KEY belum dikonfigurasi di server. Silakan periksa panel Settings > Secrets atau gunakan pemilihan makanan dari database TKPI/USDA secara manual.',
        code: 'GEMINI_NOT_CONFIGURED',
      },
      { status: 503 }
    );
  }

  let body: { imageBase64?: string; mimeType?: string; userNote?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Format payload JSON tidak valid.' }, { status: 400 });
  }

  const { imageBase64, mimeType = 'image/jpeg', userNote = '' } = body;
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return NextResponse.json({ error: 'Data foto makanan (imageBase64) wajib dikirim.' }, { status: 400 });
  }

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimes.includes(mimeType)) {
    return NextResponse.json(
      { error: 'Tipe file tidak didukung. Gunakan foto JPEG, PNG, atau WebP.' },
      { status: 415 }
    );
  }

  const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  if (cleanBase64.length > 7_000_000) {
    return NextResponse.json(
      { error: 'Ukuran gambar melebihi batas 5 MB setelah kompresi.' },
      { status: 413 }
    );
  }

  const modelName = env.GEMINI_MODEL || 'gemini-4-hydrogen';

  try {
    const ai = new GoogleGenAI({
      apiKey: env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemPrompt = [
      'Kamu adalah sistem deteksi komponen visual makanan Indonesia dan internasional untuk aplikasi MoneyScope.',
      'ATURAN KERAS:',
      '1. JANGAN PERNAH menghitung atau menebak angka kalori, protein, karbohidrat, atau lemak.',
      '2. Tugasmu HANYA mengidentifikasi komponen makanan/minuman yang terlihat di foto, memberikan nama pencarian dalam Bahasa Indonesia (nameId) dan Bahasa Inggris (nameEn), estimasi berat dalam gram (estimatedGrams beserta rentang gramsMin dan gramsMax), metode pengolahan (goreng/rebus/bakar/kukus/tumis/mentah/lainnya), tingkat keyakinan visual (confidence 0.0 s/d 1.0), serta catatan ketidakpastian porsi.',
      '3. Jika gambar sama sekali bukan makanan atau minuman, set isFoodImage = false dan jelaskan alasannya di rejectionReason.',
    ].join('\n');

    const userPrompt = userNote
      ? `Analisis komponen makanan pada foto ini. Catatan tambahan pengguna: "${userNote.slice(0, 200)}".`
      : 'Analisis seluruh komponen makanan dan minuman yang terlihat pada foto ini beserta estimasi berat gramasinya.';

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          { text: userPrompt },
        ],
      },
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isFoodImage: {
              type: Type.BOOLEAN,
              description: 'True jika gambar menampilkan makanan atau minuman.',
            },
            rejectionReason: {
              type: Type.STRING,
              description: 'Alasan jika gambar bukan makanan/minuman, atau string kosong.',
            },
            mealTitleSuggestion: {
              type: Type.STRING,
              description: 'Nama ringkas hidangan dalam Bahasa Indonesia, misal: Nasi Ayam Goreng & Sayur Bayam.',
            },
            components: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  nameId: { type: Type.STRING, description: 'Nama komponen dalam Bahasa Indonesia.' },
                  nameEn: { type: Type.STRING, description: 'Nama komponen dalam Bahasa Inggris untuk pencarian USDA.' },
                  estimatedGrams: { type: Type.NUMBER, description: 'Estimasi berat dalam gram.' },
                  gramsMin: { type: Type.NUMBER, description: 'Batas bawah estimasi gram.' },
                  gramsMax: { type: Type.NUMBER, description: 'Batas atas estimasi gram.' },
                  cookingMethod: {
                    type: Type.STRING,
                    description: 'Salah satu dari: goreng, rebus, bakar, kukus, tumis, mentah, lainnya.',
                  },
                  confidence: { type: Type.NUMBER, description: 'Skor keyakinan deteksi visual antara 0 dan 1.' },
                  uncertaintyNote: { type: Type.STRING, description: 'Catatan ketidakpastian visual porsi/saus.' },
                },
                required: [
                  'nameId',
                  'nameEn',
                  'estimatedGrams',
                  'gramsMin',
                  'gramsMax',
                  'cookingMethod',
                  'confidence',
                  'uncertaintyNote',
                ],
              },
            },
          },
          required: ['isFoodImage', 'rejectionReason', 'mealTitleSuggestion', 'components'],
        },
      },
    });

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      return NextResponse.json(
        { error: 'Model Gemini tidak mengembalikan respons. Silakan coba lagi.' },
        { status: 502 }
      );
    }

    const parsedJson = JSON.parse(rawText);
    const validated = GeminiFoodDetectionSchema.safeParse(parsedJson);
    if (!validated.success) {
      return NextResponse.json(
        {
          error: 'Respons deteksi komponen tidak memenuhi skema validasi.',
          details: validated.error.flatten(),
        },
        { status: 422 }
      );
    }

    const detection = validated.data;
    if (!detection.isFoodImage) {
      return NextResponse.json(
        {
          error:
            detection.rejectionReason ||
            'Foto yang diunggah tidak terdeteksi sebagai makanan atau minuman.',
          code: 'NOT_FOOD_IMAGE',
        },
        { status: 422 }
      );
    }

    const matchedItems: FoodItemMatch[] = [];
    for (let idx = 0; idx < detection.components.length; idx++) {
      const comp = detection.components[idx];
      const itemId = `item_${Date.now()}_${idx}`;

      // First match against curated TKPI + USDA verified table
      let matched = matchFoodComponentToDatabase({
        id: itemId,
        nameId: comp.nameId,
        nameEn: comp.nameEn,
        cookingMethod: comp.cookingMethod,
        quantityGrams: Math.round(comp.estimatedGrams),
        confidence: comp.confidence,
        isFromPhoto: true,
        uncertaintyNote: comp.uncertaintyNote,
      });

      // If unavailable locally and live USDA FDC key is configured, query USDA FDC API
      if (matched.matchStatus === 'unavailable' && isRealCredential(env.USDA_FDC_API_KEY)) {
        const usdaHit = await queryUsdaFdcIfConfigured(comp.nameEn || comp.nameId, env.USDA_FDC_API_KEY);
        if (usdaHit) {
          const ratio = Math.round(comp.estimatedGrams) / 100;
          matched = {
            id: itemId,
            nameDetected: comp.nameId,
            nameConfirmed: `${comp.nameId} (${usdaHit.description})`,
            cookingMethod: comp.cookingMethod,
            quantityGrams: Math.round(comp.estimatedGrams),
            servingUnit: 'gram',
            sourceCode: 'usda_fdc',
            sourceName: `USDA FoodData Central (${usdaHit.fdcId})`,
            sourceMatchId: usdaHit.fdcId,
            matchStatus: comp.confidence < 0.6 ? 'uncertain' : 'estimated_portion',
            confidence: Number(comp.confidence.toFixed(2)),
            calories: Math.round(usdaHit.calories * ratio),
            proteinG: Number((usdaHit.proteinG * ratio).toFixed(1)),
            carbsG: Number((usdaHit.carbsG * ratio).toFixed(1)),
            fatG: Number((usdaHit.fatG * ratio).toFixed(1)),
            fiberG: Number((usdaHit.fiberG * ratio).toFixed(1)),
            sodiumMg: Math.round(usdaHit.sodiumMg * ratio),
            uncertaintyNote: comp.uncertaintyNote,
          };
        }
      }

      matchedItems.push(matched);
    }

    return NextResponse.json({
      modelName,
      latencyMs: Date.now() - startTime,
      mealTitleSuggestion: detection.mealTitleSuggestion || 'Hidangan Makanan',
      items: matchedItems,
      disclaimer:
        'Estimasi nutrisi dihitung dari pencocokan berat visual ke database TKPI Kemenkes RI & USDA FoodData Central. Bukan pengukuran laboratorium atau saran medis.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan saat menganalisis foto.';
    return NextResponse.json(
      {
        error: `Gagal menganalisis foto makanan melalui Gemini Vision: ${message}. Anda tetap dapat memilih komponen makanan secara manual dari database TKPI/USDA.`,
        code: 'UPSTREAM_AI_ERROR',
      },
      { status: 502 }
    );
  }
}
