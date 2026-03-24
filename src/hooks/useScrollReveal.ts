import { useEffect, useRef } from "react";

export const useScrollReveal = (
  animationClass = "animate-fade-up",
  threshold = 0.15
) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add(animationClass);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animationClass, threshold]);

  return ref;
};
