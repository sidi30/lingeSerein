"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, useReducedMotion, type MotionValue } from "motion/react";

type Props = {
  titleComponent: React.ReactNode;
  children: React.ReactNode;
};

export function ContainerScroll({ titleComponent, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const { scrollYProgress } = useScroll({ target: ref });

  const scaleDimensions = (): [number, number] => (isMobile ? [0.7, 0.95] : [1.05, 1]);

  const rotate = useTransform(scrollYProgress, [0, 1], [22, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], scaleDimensions());
  const translate = useTransform(scrollYProgress, [0, 1], [0, -80]);

  if (reduced) {
    return (
      <section className="relative py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-10">{titleComponent}</div>
          <div className="rounded-[2rem] border-4 border-forest/20 bg-white shadow-2xl shadow-lavender-200/40 p-3 md:p-6 overflow-hidden">
            {children}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="relative h-[55rem] md:h-[80rem] flex items-center justify-center">
      <div className="py-10 md:py-20 w-full relative" style={{ perspective: "1000px" }}>
        <Header translate={translate}>{titleComponent}</Header>
        <Card rotate={rotate} translate={translate} scale={scale}>
          {children}
        </Card>
      </div>
    </section>
  );
}

function Header({
  translate,
  children,
}: {
  translate: MotionValue<number>;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      style={{ translateY: translate }}
      className="div max-w-5xl mx-auto text-center px-6"
    >
      {children}
    </motion.div>
  );
}

function Card({
  rotate,
  scale,
  children,
}: {
  rotate: MotionValue<number>;
  scale: MotionValue<number>;
  translate: MotionValue<number>;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      style={{
        rotateX: rotate,
        scale,
        boxShadow:
          "0 0 #0000004d, 0 9px 20px #0000004a, 0 37px 37px #00000042, 0 84px 50px #00000026, 0 149px 60px #0000000a, 0 233px 65px #00000003",
      }}
      className="max-w-6xl -mt-12 mx-auto h-[26rem] md:h-[44rem] w-full border-4 border-forest/20 bg-gradient-to-br from-cream-warm to-lavender-50 rounded-[30px] p-3 md:p-6 shadow-2xl shadow-lavender-200/40"
    >
      <div className="h-full w-full overflow-hidden rounded-2xl bg-white">{children}</div>
    </motion.div>
  );
}
