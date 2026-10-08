class ImagePaletteProcessor {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  async extractColors(imageElement, targetColors, quality = 'balanced') {
    const maxDimension = quality === 'fast' ? 180 : quality === 'high' ? 520 : 320;
    const scale = Math.min(1, maxDimension / Math.max(imageElement.naturalWidth || imageElement.width, imageElement.naturalHeight || imageElement.height));

    const width = Math.max(1, Math.round((imageElement.naturalWidth || imageElement.width) * scale));
    const height = Math.max(1, Math.round((imageElement.naturalHeight || imageElement.height) * scale));

    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.drawImage(imageElement, 0, 0, width, height);

    const imageData = this.ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const samples = [];
    const step = quality === 'fast' ? 4 : quality === 'high' ? 1 : 2;

    for (let i = 0; i < data.length; i += 4 * step) {
      const alpha = data[i + 3];
      if (alpha < 128) continue;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3;

      if (brightness > 248 && r > 245 && g > 245 && b > 245) continue;

      samples.push({ r, g, b, weight: 1 });
    }

    if (!samples.length) {
      return [];
    }

    const clusteredColors = this.kMeansPalette(samples, Math.min(targetColors, 12));
    const sortedColors = clusteredColors
      .map((color) => ({
        ...color,
        rgb: { r: color.r, g: color.g, b: color.b },
        hex: rgbToHex(color.r, color.g, color.b),
        hsl: rgbToHsl(color.r, color.g, color.b),
      }))
      .sort((a, b) => b.weight - a.weight);

    const totalWeight = sortedColors.reduce((sum, color) => sum + color.weight, 0);

    return sortedColors.map((color, i) => ({
      id: `${color.hex}-${i}`,
      hex: color.hex,
      rgb: color.rgb,
      hsl: color.hsl,
      weight: color.weight,
      percentage: Number(((color.weight / totalWeight) * 100).toFixed(1)),
      contrastColor: getContrastTextColor(color.r, color.g, color.b)
    }));
  }

  kMeansPalette(samples, k) {
    const centers = [];
    const sampleLimit = Math.min(samples.length, 2000);
    const chosen = samples.slice(0, sampleLimit);

    for (let i = 0; i < k; i++) {
      const sample = chosen[Math.floor((i / k) * chosen.length)] || chosen[0];
      centers.push({ r: sample.r, g: sample.g, b: sample.b, weight: 1 });
    }

    for (let iteration = 0; iteration < 8; iteration++) {
      const buckets = Array.from({ length: k }, () => ({ r: 0, g: 0, b: 0, totalWeight: 0 }));

      for (const sample of chosen) {
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (let i = 0; i < centers.length; i++) {
          const center = centers[i];
          const distance = sqDistance(sample, center);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = i;
          }
        }

        const bucket = buckets[nearestIndex];
        bucket.r += sample.r * sample.weight;
        bucket.g += sample.g * sample.weight;
        bucket.b += sample.b * sample.weight;
        bucket.totalWeight += sample.weight;
      }

      for (let i = 0; i < k; i++) {
        const bucket = buckets[i];
        if (bucket.totalWeight > 0) {
          centers[i] = {
            r: Math.round(bucket.r / bucket.totalWeight),
            g: Math.round(bucket.g / bucket.totalWeight),
            b: Math.round(bucket.b / bucket.totalWeight),
            weight: bucket.totalWeight,
          };
        }
      }
    }

    const finalColors = centers.map((center, index) => ({
      r: center.r,
      g: center.g,
      b: center.b,
      weight: Math.max(1, Math.round((this.getCenterWeight(chosen, center) / Math.max(1, chosen.length)) * 1000)),
      clusterIndex: index,
    }));

    return finalColors.filter((color) => {
      const others = finalColors.filter((other) => other !== color);
      return !others.some((other) => colorDistance(color, other) < 25);
    }).slice(0, k);
  }

  getCenterWeight(samples, center) {
    let total = 0;
    for (const sample of samples) {
      const distance = sqDistance(sample, center);
      if (distance < 900) total += sample.weight;
    }
    return total;
  }
}

function sqDistance(a, b) {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

function colorDistance(a, b) {
  return Math.sqrt(sqDistance(a, b));
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h;
  let s;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }

    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

function rgbToString(r, g, b) {
  return `RGB(${r}, ${g}, ${b})`;
}

function hslToString(h, s, l) {
  return `HSL(${h}, ${s}%, ${l}%)`;
}

function getContrastTextColor(r, g, b) {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111827' : '#F8FAFC';
}

function hexToRgb(hex) {
  const safeHex = hex.replace('#', '');
  const bigint = Number.parseInt(safeHex, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function normalizeHex(hex) {
  return hex.startsWith('#') ? hex : `#${hex}`;
}
