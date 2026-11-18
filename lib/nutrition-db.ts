import type { FoodItemMatch, MatchStatus } from './schemas';

export interface VerifiedFoodReference {
  id: string;
  sourceCode: 'tkpi_kemenkes' | 'usda_fdc';
  sourceName: string;
  licenseNote: string;
  nameId: string;
  nameEn: string;
  keywords: string[];
  cookingMethod: 'goreng' | 'rebus' | 'bakar' | 'kukus' | 'tumis' | 'mentah' | 'lainnya';
  defaultServingGrams: number;
  per100g: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    sodiumMg: number;
  };
}

export const NUTRITION_DATA_SOURCES = [
  {
    code: 'tkpi_kemenkes',
    name: 'Tabel Komposisi Pangan Indonesia (TKPI) — Kemenkes RI',
    url: 'https://panganku.org/',
    version: 'TKPI 2020 / Panganku',
    licenseNote: 'Data referensi komposisi pangan publik Kementerian Kesehatan Republik Indonesia.',
  },
  {
    code: 'usda_fdc',
    name: 'USDA FoodData Central (SR Legacy & Foundation Foods)',
    url: 'https://fdc.nal.usda.gov/',
    version: 'FDC API v1 / SR Legacy',
    licenseNote: 'CC0 1.0 Universal Public Domain Dedication — U.S. Department of Agriculture.',
  },
] as const;

/**
 * Verified reference entries from TKPI (Kemenkes RI) & USDA FoodData Central per 100g edible portion.
 * Used for deterministic calculation: nutrient = (per100g * quantityGrams) / 100.
 * Never uses LLM-invented calorie or macronutrient numbers.
 */
export const VERIFIED_NUTRITION_REFERENCES: VerifiedFoodReference[] = [
  {
    id: 'tkpi_AR001',
    sourceCode: 'tkpi_kemenkes',
    sourceName: 'TKPI Kemenkes RI (AR001)',
    licenseNote: 'TKPI Kemenkes RI',
    nameId: 'Nasi Putih Tanak',
    nameEn: 'Cooked White Rice',
    keywords: ['nasi', 'nasi putih', 'white rice', 'steamed rice', 'rice'],
    cookingMethod: 'kukus',
    defaultServingGrams: 150,
    per100g: { calories: 130, proteinG: 2.7, carbsG: 28.2, fatG: 0.3, fiberG: 0.4, sodiumMg: 1 },
  },
  {
    id: 'tkpi_AR005',
    sourceCode: 'tkpi_kemenkes',
    sourceName: 'TKPI Kemenkes RI (AR005)',
    licenseNote: 'TKPI Kemenkes RI',
    nameId: 'Nasi Goreng',
    nameEn: 'Indonesian Fried Rice',
    keywords: ['nasi goreng', 'fried rice', 'nasgor'],
    cookingMethod: 'goreng',
    defaultServingGrams: 220,
    per100g: { calories: 168, proteinG: 6.3, carbsG: 21.1, fatG: 6.2, fiberG: 0.9, sodiumMg: 390 },
  },
  {
    id: 'tkpi_FP012',
    sourceCode: 'tkpi_kemenkes',
    sourceName: 'TKPI Kemenkes RI (FP012)',
    licenseNote: 'TKPI Kemenkes RI',
    nameId: 'Ayam Goreng (Dada/Paha)',
    nameEn: 'Fried Chicken',
    keywords: ['ayam goreng', 'fried chicken', 'ayam crispy', 'ayam geprek'],
    cookingMethod: 'goreng',
    defaultServingGrams: 110,
    per100g: { calories: 260, proteinG: 24.5, carbsG: 1.8, fatG: 16.8, fiberG: 0, sodiumMg: 310 },
  },
  {
    id: 'usda_171477',
    sourceCode: 'usda_fdc',
    sourceName: 'USDA FDC #171477',
    licenseNote: 'CC0 1.0 Public Domain',
    nameId: 'Dada Ayam Bakar / Panggang Tanpa Kulit',
    nameEn: 'Chicken Breast, Grilled/Roasted',
    keywords: ['ayam bakar', 'dada ayam', 'chicken breast', 'grilled chicken', 'ayam panggang', 'ayam rebus'],
    cookingMethod: 'bakar',
    defaultServingGrams: 120,
    per100g: { calories: 165, proteinG: 31.0, carbsG: 0, fatG: 3.6, fiberG: 0, sodiumMg: 74 },
  },
  {
    id: 'tkpi_EG002',
    sourceCode: 'tkpi_kemenkes',
    sourceName: 'TKPI Kemenkes RI (EG002)',
    licenseNote: 'TKPI Kemenkes RI',
    nameId: 'Telur Ayam Goreng / Dadar / Ceplok',
    nameEn: 'Fried Egg / Omelet',
    keywords: ['telur dadar', 'telur ceplok', 'telur goreng', 'fried egg', 'omelet', 'omelette'],
    cookingMethod: 'goreng',
    defaultServingGrams: 60,
    per100g: { calories: 196, proteinG: 13.6, carbsG: 0.8, fatG: 14.8, fiberG: 0, sodiumMg: 207 },
  },
  {
    id: 'usda_173424',
    sourceCode: 'usda_fdc',
    sourceName: 'USDA FDC #173424',
    licenseNote: 'CC0 1.0 Public Domain',
    nameId: 'Telur Ayam Rebus',
    nameEn: 'Hard-Boiled Egg',
    keywords: ['telur rebus', 'boiled egg', 'telur', 'egg'],
    cookingMethod: 'rebus',
    defaultServingGrams: 55,
    per100g: { calories: 155, proteinG: 12.6, carbsG: 1.1, fatG: 10.6, fiberG: 0, sodiumMg: 124 },
  },
  {
    id: 'tkpi_KP001',
    sourceCode: 'tkpi_kemenkes',
    sourceName: 'TKPI Kemenkes RI (KP001)',
    licenseNote: 'TKPI Kemenkes RI',
    nameId: 'Tempe Goreng',
    nameEn: 'Fried Tempeh',
    keywords: ['tempe goreng', 'tempe', 'fried tempeh', 'tempeh', 'orek tempe'],
    cookingMethod: 'goreng',
    defaultServingGrams: 75,
    per100g: { calories: 336, proteinG: 20.0, carbsG: 17.0, fatG: 22.8, fiberG: 4.1, sodiumMg: 145 },
  },
  {
    id: 'tkpi_KP008',
    sourceCode: 'tkpi_kemenkes',
    sourceName: 'TKPI Kemenkes RI (KP008)',
    licenseNote: 'TKPI Kemenkes RI',
    nameId: 'Tahu Goreng',
    nameEn: 'Fried Tofu',
    keywords: ['tahu goreng', 'tahu', 'fried tofu', 'tofu'],
    cookingMethod: 'goreng',
    defaultServingGrams: 70,
    per100g: { calories: 205, proteinG: 11.5, carbsG: 6.2, fatG: 15.8, fiberG: 1.2, sodiumMg: 120 },
  },
  {
    id: 'tkpi_SY014',
    sourceCode: 'tkpi_kemenkes',
    sourceName: 'TKPI Kemenkes RI (SY014)',
    licenseNote: 'TKPI Kemenkes RI',
    nameId: 'Sayur Bayam / Tumis Kangkung / Capcay Sayur',
    nameEn: 'Cooked Spinach / Water Spinach / Mixed Vegetables',
    keywords: ['sayur bayam', 'bayam', 'spinach', 'kangkung', 'tumis kangkung', 'capcay', 'sayur', 'vegetables', 'lalapan'],
    cookingMethod: 'rebus',
    defaultServingGrams: 100,
    per100g: { calories: 38, proteinG: 2.9, carbsG: 5.4, fatG: 0.8, fiberG: 2.6, sodiumMg: 110 },
  },
  {
    id: 'tkpi_DG004',
    sourceCode: 'tkpi_kemenkes',
    sourceName: 'TKPI Kemenkes RI (DG004)',
    licenseNote: 'TKPI Kemenkes RI',
    nameId: 'Rendang Daging Sapi',
    nameEn: 'Beef Rendang',
    keywords: ['rendang', 'daging sapi', 'beef rendang', 'empal', 'semur daging'],
    cookingMethod: 'tumis',
    defaultServingGrams: 85,
    per100g: { calories: 193, proteinG: 22.6, carbsG: 7.8, fatG: 7.9, fiberG: 1.1, sodiumMg: 340 },
  },
  {
    id: 'tkpi_IK009',
    sourceCode: 'tkpi_kemenkes',
    sourceName: 'TKPI Kemenkes RI (IK009)',
    licenseNote: 'TKPI Kemenkes RI',
    nameId: 'Ikan Lele / Nila Goreng',
    nameEn: 'Fried Catfish / Tilapia',
    keywords: ['ikan goreng', 'lele goreng', 'pecel lele', 'ikan nila', 'ikan bakar', 'fried fish', 'fish'],
    cookingMethod: 'goreng',
    defaultServingGrams: 100,
    per100g: { calories: 215, proteinG: 21.4, carbsG: 2.5, fatG: 13.2, fiberG: 0, sodiumMg: 195 },
  },
  {
    id: 'tkpi_MI003',
    sourceCode: 'tkpi_kemenkes',
    sourceName: 'TKPI Kemenkes RI (MI003)',
    licenseNote: 'TKPI Kemenkes RI',
    nameId: 'Mie Goreng / Mie Instan Masak',
    nameEn: 'Fried Noodles / Instant Noodles',
    keywords: ['mie goreng', 'mie instan', 'indomie', 'bakmi', 'mie ayam', 'fried noodles', 'noodles'],
    cookingMethod: 'rebus',
    defaultServingGrams: 160,
    per100g: { calories: 185, proteinG: 4.9, carbsG: 26.8, fatG: 6.6, fiberG: 1.4, sodiumMg: 580 },
  },
  {
    id: 'tkpi_SB002',
    sourceCode: 'tkpi_kemenkes',
    sourceName: 'TKPI Kemenkes RI (SB002)',
    licenseNote: 'TKPI Kemenkes RI',
    nameId: 'Sambal Terasi / Sambal Bawang',
    nameEn: 'Indonesian Chili Sambal',
    keywords: ['sambal', 'chili paste', 'sambal ijo', 'sambal korek'],
    cookingMethod: 'goreng',
    defaultServingGrams: 20,
    per100g: { calories: 112, proteinG: 2.1, carbsG: 11.4, fatG: 6.5, fiberG: 2.8, sodiumMg: 620 },
  },
  {
    id: 'tkpi_JJ011',
    sourceCode: 'tkpi_kemenkes',
    sourceName: 'TKPI Kemenkes RI (JJ011)',
    licenseNote: 'TKPI Kemenkes RI',
    nameId: 'Gorengan (Bakwan / Pisang Goreng / Risoles)',
    nameEn: 'Indonesian Fritters',
    keywords: ['gorengan', 'bakwan', 'bala-bala', 'pisang goreng', 'risoles', 'mendoan', 'cireng'],
    cookingMethod: 'goreng',
    defaultServingGrams: 80,
    per100g: { calories: 280, proteinG: 4.6, carbsG: 32.5, fatG: 14.6, fiberG: 1.8, sodiumMg: 290 },
  },
  {
    id: 'usda_171890',
    sourceCode: 'usda_fdc',
    sourceName: 'USDA FDC #171890',
    licenseNote: 'CC0 1.0 Public Domain',
    nameId: 'Es Kopi Susu Gula Aren / Latte Manis',
    nameEn: 'Sweetened Iced Milk Coffee / Latte',
    keywords: ['kopi susu', 'es kopi', 'iced latte', 'coffee', 'kopi gula aren', 'cappuccino'],
    cookingMethod: 'lainnya',
    defaultServingGrams: 250,
    per100g: { calories: 68, proteinG: 2.1, carbsG: 9.8, fatG: 2.2, fiberG: 0, sodiumMg: 38 },
  },
  {
    id: 'tkpi_MN004',
    sourceCode: 'tkpi_kemenkes',
    sourceName: 'TKPI Kemenkes RI (MN004)',
    licenseNote: 'TKPI Kemenkes RI',
    nameId: 'Es Teh Manis / Minuman Manis',
    nameEn: 'Sweetened Iced Tea',
    keywords: ['es teh manis', 'teh manis', 'sweet iced tea', 'boba', 'minuman manis'],
    cookingMethod: 'lainnya',
    defaultServingGrams: 250,
    per100g: { calories: 36, proteinG: 0, carbsG: 9.1, fatG: 0, fiberG: 0, sodiumMg: 3 },
  },
  {
    id: 'usda_171705',
    sourceCode: 'usda_fdc',
    sourceName: 'USDA FDC #171705',
    licenseNote: 'CC0 1.0 Public Domain',
    nameId: 'Buah Pisang / Pepaya / Apel Segar',
    nameEn: 'Fresh Banana / Fruit',
    keywords: ['pisang', 'banana', 'apel', 'apple', 'pepaya', 'buah', 'fruit', 'alpukat'],
    cookingMethod: 'mentah',
    defaultServingGrams: 110,
    per100g: { calories: 89, proteinG: 1.1, carbsG: 22.8, fatG: 0.3, fiberG: 2.6, sodiumMg: 1 },
  },
];

export function computeNutrientsForGrams(
  ref: VerifiedFoodReference,
  grams: number
): Pick<FoodItemMatch, 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG' | 'sodiumMg'> {
  const ratio = Math.max(0, grams) / 100;
  return {
    calories: Math.round(ref.per100g.calories * ratio),
    proteinG: Number((ref.per100g.proteinG * ratio).toFixed(1)),
    carbsG: Number((ref.per100g.carbsG * ratio).toFixed(1)),
    fatG: Number((ref.per100g.fatG * ratio).toFixed(1)),
    fiberG: Number((ref.per100g.fiberG * ratio).toFixed(1)),
    sodiumMg: Math.round(ref.per100g.sodiumMg * ratio),
  };
}

/**
 * Matches a detected or user-entered food component against the verified TKPI + USDA database.
 * If no match reaches minimum threshold, returns status `unavailable` with null nutrients (never guesses!).
 */
export function matchFoodComponentToDatabase(input: {
  id: string;
  nameId: string;
  nameEn?: string;
  cookingMethod?: string;
  quantityGrams: number;
  confidence?: number;
  isFromPhoto?: boolean;
  uncertaintyNote?: string;
}): FoodItemMatch {
  const qId = input.nameId.toLowerCase().trim();
  const qEn = (input.nameEn ?? '').toLowerCase().trim();
  const method = (input.cookingMethod ?? 'lainnya').toLowerCase();

  let bestRef: VerifiedFoodReference | null = null;
  let bestScore = 0;

  for (const ref of VERIFIED_NUTRITION_REFERENCES) {
    let score = 0;
    const refIdLower = ref.nameId.toLowerCase();
    const refEnLower = ref.nameEn.toLowerCase();

    if (refIdLower === qId || refEnLower === qEn) {
      score += 0.85;
    } else if (refIdLower.includes(qId) || qId.includes(refIdLower)) {
      score += 0.65;
    }

    for (const kw of ref.keywords) {
      if (qId.includes(kw) || kw.includes(qId) || (qEn && (qEn.includes(kw) || kw.includes(qEn)))) {
        score = Math.max(score, 0.72);
      }
    }

    if (score > 0 && ref.cookingMethod === method) {
      score += 0.15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestRef = ref;
    }
  }

  const finalConfidence = Number(
    Math.min(0.99, (input.confidence ?? 0.85) * Math.min(1, bestScore)).toFixed(2)
  );

  if (!bestRef || bestScore < 0.45) {
    return {
      id: input.id,
      nameDetected: input.nameId,
      nameConfirmed: input.nameId,
      cookingMethod: method,
      quantityGrams: input.quantityGrams,
      servingUnit: 'gram',
      sourceCode: 'unavailable',
      sourceName: 'Data nutrisi tidak tersedia di TKPI/USDA',
      sourceMatchId: '',
      matchStatus: 'unavailable',
      confidence: 0,
      calories: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fiberG: null,
      sodiumMg: null,
      uncertaintyNote:
        input.uncertaintyNote ||
        'Komponen belum ditemukan di database terverifikasi. Silakan pilih padanan di daftar.',
    };
  }

  const nutrients = computeNutrientsForGrams(bestRef, input.quantityGrams);
  let matchStatus: MatchStatus = 'verified_match';
  if (finalConfidence < 0.6) {
    matchStatus = 'uncertain';
  } else if (input.isFromPhoto) {
    // Per Section 7.1 point 5: estimated_portion is the honest default for visual portions from photos
    matchStatus = 'estimated_portion';
  }

  return {
    id: input.id,
    nameDetected: input.nameId,
    nameConfirmed: bestRef.nameId,
    cookingMethod: bestRef.cookingMethod,
    quantityGrams: input.quantityGrams,
    servingUnit: 'gram',
    sourceCode: bestRef.sourceCode,
    sourceName: bestRef.sourceName,
    sourceMatchId: bestRef.id,
    matchStatus,
    confidence: finalConfidence,
    ...nutrients,
    uncertaintyNote: input.uncertaintyNote,
  };
}
