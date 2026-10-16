
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGE_DIMENSION = 6000;
const MAX_IMAGE_PIXELS = 12_000_000;

function unable(message) {
  return {
    status: "unable",
    findings: [],
    notes: [message],
    qualityWarnings: [],
    indicators: [],
    metrics: null,
    ela: null,
    heatmap: null,
  };
}

function validateFile(file) {
  if (!file) {
    throw new Error("No passport image was provided.");
  }

  if (!file.type?.startsWith("image/")) {
    throw new Error("The uploaded file is not an image.");
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("Image exceeds the 10 MB limit.");
  }
}

async function loadImage(file) {
  const url = URL.createObjectURL(file);

  try {
    const image = new Image();

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () =>
        reject(new Error("Could not read the image."));
      image.src = url;
    });

    if (
      image.naturalWidth > MAX_IMAGE_DIMENSION ||
      image.naturalHeight > MAX_IMAGE_DIMENSION ||
      image.naturalWidth * image.naturalHeight >
        MAX_IMAGE_PIXELS
    ) {
      throw new Error(
        "Image dimensions exceed the supported limit."
      );
    }

    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getCanvasContext(canvas) {
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error("Canvas is not supported by this browser.");
  }

  return context;
}

function getImageMetrics(image) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;

  const context = getCanvasContext(canvas);
  context.drawImage(image, 0, 0, 128, 128);

  const pixels = context.getImageData(0, 0, 128, 128).data;

  let brightness = 0;
  let brightnessSquared = 0;
  let edgeDifference = 0;
  let samples = 0;

  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const index = (y * 128 + x) * 4;

      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];

      const gray =
        0.299 * r +
        0.587 * g +
        0.114 * b;

      brightness += gray;
      brightnessSquared += gray * gray;
      samples++;

      if (x > 0) {
        const leftIndex = index - 4;

        const leftGray =
          0.299 * pixels[leftIndex] +
          0.587 * pixels[leftIndex + 1] +
          0.114 * pixels[leftIndex + 2];

        edgeDifference += Math.abs(gray - leftGray);
      }

      if (y > 0) {
        const topIndex = index - 128 * 4;

        const topGray =
          0.299 * pixels[topIndex] +
          0.587 * pixels[topIndex + 1] +
          0.114 * pixels[topIndex + 2];

        edgeDifference += Math.abs(gray - topGray);
      }
    }
  }

  const meanBrightness = brightness / samples;

  const variance =
    brightnessSquared / samples -
    meanBrightness * meanBrightness;

  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    brightness: Number(meanBrightness.toFixed(2)),
    contrast: Number(Math.sqrt(Math.max(0, variance)).toFixed(2)),
    edgeDifference: Number(
      (edgeDifference / samples).toFixed(2)
    ),
  };
}

function getQualityWarnings(metrics) {
  const warnings = [];

  if (metrics.width < 500 || metrics.height < 300) {
    warnings.push(
      "The image resolution is low; small document details may be unclear."
    );
  }

  if (metrics.brightness < 45) {
    warnings.push(
      "The image may be too dark for reliable inspection."
    );
  }

  if (metrics.brightness > 225) {
    warnings.push(
      "The image may be overexposed."
    );
  }

  if (metrics.contrast < 20) {
    warnings.push(
      "The image has low contrast."
    );
  }

  return warnings;
}

async function runELA(file, image) {
  if (file.type !== "image/jpeg") {
    return {
      available: false,
      note: "ELA was skipped because the uploaded image is not JPEG.",
      heatmap: null,
    };
  }

  const originalCanvas = document.createElement("canvas");
  const width = Math.min(image.naturalWidth, 1200);
  const height = Math.max(
    1,
    Math.round(
      image.naturalHeight *
        (width / image.naturalWidth)
    )
  );

  originalCanvas.width = width;
  originalCanvas.height = height;

  const originalContext = getCanvasContext(originalCanvas);

  originalContext.drawImage(image, 0, 0, width, height);

  const originalData = originalContext.getImageData(
    0,
    0,
    width,
    height
  );

  const compressedCanvas = document.createElement("canvas");
  compressedCanvas.width = width;
  compressedCanvas.height = height;

  const compressedContext = getCanvasContext(compressedCanvas);

  compressedContext.drawImage(originalCanvas, 0, 0);

  const compressedBlob = await new Promise((resolve) => {
    compressedCanvas.toBlob(resolve, "image/jpeg", 0.90);
  });

  if (!compressedBlob) {
    return {
      available: false,
      note: "ELA could not create a comparison image.",
      heatmap: null,
    };
  }

  const compressedImage = await loadImage(compressedBlob);

  const comparisonCanvas = document.createElement("canvas");
  comparisonCanvas.width = width;
  comparisonCanvas.height = height;

  const comparisonContext = getCanvasContext(comparisonCanvas);

  comparisonContext.drawImage(
    compressedImage,
    0,
    0,
    width,
    height
  );

  const compressedData = comparisonContext.getImageData(
    0,
    0,
    width,
    height
  );

  const heatmap = new Uint8ClampedArray(
    originalData.data.length
  );

  let totalDifference = 0;
  let maxDifference = 0;
  let pixelCount = 0;

  for (let i = 0; i < originalData.data.length; i += 4) {
    const difference =
      Math.abs(originalData.data[i] - compressedData.data[i]) +
      Math.abs(
        originalData.data[i + 1] -
          compressedData.data[i + 1]
      ) +
      Math.abs(
        originalData.data[i + 2] -
          compressedData.data[i + 2]
      );

    const averageDifference = difference / 3;

    totalDifference += averageDifference;
    maxDifference = Math.max(
      maxDifference,
      averageDifference
    );

    pixelCount++;

    const amplified = Math.min(
      255,
      averageDifference * 10
    );

    heatmap[i] = amplified;
    heatmap[i + 1] = amplified;
    heatmap[i + 2] = amplified;
    heatmap[i + 3] = 255;
  }

  return {
    available: true,
    note:
      "ELA highlights differences after recompression. Differences can occur naturally and do not prove tampering.",
    meanDifference: Number(
      (totalDifference / pixelCount).toFixed(2)
    ),
    maxDifference: Number(maxDifference.toFixed(2)),
    width,
    height,
    heatmap: {
      width,
      height,
      data: Array.from(heatmap),
    },
  };
}

/**
 * Experimental image screening.
 *
 * This does not prove whether a document is genuine or forged.
 * Results require manual review.
 */
export async function analyzeTampering(file) {
  try {
    validateFile(file);

    const image = await loadImage(file);
    const metrics = getImageMetrics(image);
    const qualityWarnings = getQualityWarnings(metrics);

    const findings = [];
    const indicators = [];
    const notes = [];

    let ela = null;

    try {
      ela = await runELA(file, image);

      if (!ela.available) {
        notes.push(ela.note);
      }
    } catch {
      notes.push(
        "ELA analysis could not be completed."
      );
    }

    /*
     * ELA differences and image quality are not reliable
     * proof of tampering. Do not automatically label a document
     * suspicious based on these metrics alone.
     */
    notes.push(
      "Automated image analysis is experimental and cannot confirm document authenticity."
    );

    notes.push(
      "Review the original image and compare suspicious regions manually."
    );

    return {
      status: "inconclusive",
      findings,
      notes,
      qualityWarnings,
      indicators,
      metrics,
      ela,
      heatmap: ela?.heatmap ?? null,
    };
  } catch (error) {
    return unable(
      error?.message ||
        "Image analysis could not be completed."
    );
  }
}

/**
 * Draw the ELA heatmap onto a canvas.
 * Pass the canvas element and the heatmap object from the result.
 */
export function drawHeatmap(targetCanvas, heatmap) {
  if (
    !targetCanvas ||
    !heatmap?.data ||
    !heatmap.width ||
    !heatmap.height
  ) {
    throw new Error("Invalid canvas or heatmap data.");
  }

  targetCanvas.width = heatmap.width;
  targetCanvas.height = heatmap.height;

  const context = getCanvasContext(targetCanvas);

  const imageData = context.createImageData(
    heatmap.width,
    heatmap.height
  );

  imageData.data.set(heatmap.data);

  context.putImageData(imageData, 0, 0);
}
