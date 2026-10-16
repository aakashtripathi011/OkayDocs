"use client";

import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";

export default function PassportCropModal({
  image,
  onCancel,
  onConfirm,
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [error, setError] = useState("");

  const onCropComplete = useCallback((_, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  async function confirmCrop() {
    try {
      setError("");

      if (!croppedAreaPixels) {
        setError("Select the portrait area first.");
        return;
      }

      const img = new Image();
      img.src = image;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      canvas.width = croppedAreaPixels.width;
      canvas.height = croppedAreaPixels.height;

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Could not process the cropped image.");
      }

      context.drawImage(
        img,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        canvas.width,
        canvas.height
      );

      onConfirm(canvas.toDataURL("image/jpeg", 0.95));
    } catch (err) {
      console.error("[CROP] Failed:", err);
      setError("Could not crop this image. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
        className="w-full max-w-xl border border-[#343434] bg-[#0b0b0b] p-5 text-[#e8edf2] sm:p-7"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-[#61e294]">
          OkayDocs / Portrait selection
        </p>

        <h2
          id="crop-title"
          className="mt-3 text-2xl font-black uppercase tracking-tight"
        >
          Crop passport portrait
        </h2>

        <p className="mt-2 text-sm leading-6 text-[#b0b0b0]">
          Move and zoom the image until the passport photo is inside the
          crop area.
        </p>

        <div className="relative mt-5 h-[320px] overflow-hidden border border-[#343434] bg-black">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={3 / 4}
            minZoom={1}
            maxZoom={3}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            restrictPosition
            showGrid={false}
          />
        </div>

        <label className="mt-5 block text-xs uppercase tracking-widest text-[#b0b0b0]">
          Zoom
        </label>

        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="mt-3 w-full accent-[#61e294]"
        />

        {error && (
          <p role="alert" className="mt-3 text-sm text-[#ffd19c]">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="border border-[#484848] px-5 py-3 text-xs font-bold uppercase tracking-wider hover:border-white"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={confirmCrop}
            className="bg-[#61e294] px-5 py-3 text-xs font-black uppercase tracking-wider text-black hover:bg-[#8af0ad]"
          >
            Confirm portrait →
          </button>
        </div>
      </section>
    </div>
  );
}