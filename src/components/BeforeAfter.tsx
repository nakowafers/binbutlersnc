import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";

const PAIRS = [
  {
    label: "Blue recycling bin, before and after cleaning",
    beforeSrc: "/assets/before-after/blue_bin_before.jpg",
    afterSrc: "/assets/before-after/blue_bin_after.jpg",
    beforeAlt: "A blue recycling bin, dirty inside before a Bin Butlers cleaning",
    afterAlt: "The same blue recycling bin, sanitized and spotless after a Bin Butlers cleaning",
  },
  {
    label: "Green trash bin, before and after cleaning",
    beforeSrc: "/assets/before-after/green_bin_before.jpg",
    afterSrc: "/assets/before-after/green_bin_after.jpg",
    beforeAlt: "A green trash bin, dirty inside before a Bin Butlers cleaning",
    afterAlt: "The same green trash bin, sanitized and spotless after a Bin Butlers cleaning",
  },
];

export function BeforeAfter() {
  return (
    <section id="results" className="py-24 bg-white border-b border-slate-200 scroll-mt-24">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl md:text-4xl font-extrabold text-[#1C3D5A] mb-4 text-balance">
          See the <span className="text-[#7AC142]">Bin Butlers</span> Difference
        </h2>
        <p className="text-slate-600 mb-16 max-w-2xl mx-auto text-pretty">
          Drag the handle to see what your bins look like before and after we clean them.
        </p>
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {PAIRS.map((pair) => (
            <BeforeAfterSlider
              key={pair.label}
              beforeSrc={pair.beforeSrc}
              afterSrc={pair.afterSrc}
              beforeAlt={pair.beforeAlt}
              afterAlt={pair.afterAlt}
              label={pair.label}
              sizes="(min-width: 1024px) 480px, (min-width: 768px) 45vw, 92vw"
            />
          ))}
        </div>
      </div>
    </section>
  );
}