import { describe, expect, it } from "vitest";
import {
  hoa2Coefficients,
  hoa3Coefficients,
  buildHoa2PanGraph,
  buildHoa2MixGraph,
  buildHoa3PanGraph,
  buildHoa2FromSurround51PanGraph,
  concatHoa2Clips,
  surround51ToHoa2Coefficients,
} from "@/lib/ambisonic-hoa";

describe("ambisonic-hoa", () => {
  describe("hoa2Coefficients — SN3D spherical harmonics at el=0", () => {
    it("gives canonical values at azimuth 0 (front-centre)", () => {
      const c = hoa2Coefficients(0);
      // ACN 0 (W) always 1
      expect(c[0]).toBeCloseTo(1, 6);
      // ACN 1 (Y = sin az) = 0
      expect(c[1]).toBeCloseTo(0, 6);
      // ACN 2 (Z, el=0) = 0
      expect(c[2]).toBe(0);
      // ACN 3 (X = cos az) = 1
      expect(c[3]).toBeCloseTo(1, 6);
      // ACN 4 (V = k2·sin 2az) = 0
      expect(c[4]).toBeCloseTo(0, 6);
      // ACN 6 (R at el=0) = -1/2
      expect(c[6]).toBeCloseTo(-0.5, 6);
      // ACN 8 (U = k2·cos 2az) = sqrt(3)/2 ≈ 0.866
      expect(c[8]).toBeCloseTo(Math.sqrt(3) / 2, 6);
    });

    it("placing a source at ±30° produces symmetric X/Y", () => {
      const cL = hoa2Coefficients(+30 * (Math.PI / 180));
      const cR = hoa2Coefficients(-30 * (Math.PI / 180));
      // Y swaps sign, X identical
      expect(cL[1]).toBeCloseTo(-cR[1]!, 6);
      expect(cL[3]).toBeCloseTo(cR[3]!, 6);
      // V swaps sign, U identical
      expect(cL[4]).toBeCloseTo(-cR[4]!, 6);
      expect(cL[8]).toBeCloseTo(cR[8]!, 6);
    });

    it("90° source puts full magnitude on Y, zero on X", () => {
      const c = hoa2Coefficients(Math.PI / 2);
      expect(c[1]).toBeCloseTo(1, 6); // Y = sin 90° = 1
      expect(c[3]).toBeCloseTo(0, 6); // X = cos 90° = 0
    });
  });

  describe("buildHoa2PanGraph — ffmpeg filter graph", () => {
    it("returns 9 channels, asplit + 9 pan nodes + amerge", () => {
      const { panGraph, outLabel, channelCount } = buildHoa2PanGraph();
      expect(channelCount).toBe(9);
      expect(outLabel).toBe("[hoaOut]");
      expect(panGraph).toContain("[0:a]asplit=9");
      expect(panGraph).toContain("amerge=inputs=9");
      // One pan= fragment per ACN channel
      const panCount = (panGraph.match(/pan=mono\|c0=/g) ?? []).length;
      expect(panCount).toBe(9);
    });

    it("coefficients are stable (smoke test for the ACN 8 U channel)", () => {
      const { panGraph } = buildHoa2PanGraph();
      // ACN 8 weights should contain the sqrt(3)/2 ≈ 0.866025 factor
      expect(panGraph).toMatch(/0\.8660/);
    });
  });

  // ---------------------------------------------------------------------
  // HOA order 3 — 16 channels (ACN 0..15), SN3D
  // ---------------------------------------------------------------------

  describe("hoa3Coefficients — SN3D real spherical harmonics", () => {
    it("matches hoa2Coefficients on the first 9 entries when el=0", () => {
      // The two functions must agree on the shared (l≤2) subspace at
      // horizontal elevation; otherwise HOA3 is silently broken for any
      // consumer that processes the HOA2 subset.
      const az = 47 * (Math.PI / 180);
      const c2 = hoa2Coefficients(az);
      const c3 = hoa3Coefficients(az, 0);
      for (let i = 0; i < 9; i++) {
        expect(c3[i]).toBeCloseTo(c2[i]!, 6);
      }
      expect(c3.length).toBe(16);
    });

    it("gives canonical values at az=0, el=0 (front-centre on horizon)", () => {
      const c = hoa3Coefficients(0, 0);
      // ACN 15 (Y_3^3 = √(5/8)·cos(0)·1) ≈ 0.790569
      expect(c[15]).toBeCloseTo(Math.sqrt(5 / 8), 6);
      // ACN 9  (Y_3^-3 = √(5/8)·sin(0)·1) = 0
      expect(c[9]).toBeCloseTo(0, 6);
      // ACN 13 (Y_3^1 = √(3/8)·cos(0)·1·(0-1)) ≈ -0.612372
      expect(c[13]).toBeCloseTo(-Math.sqrt(3 / 8), 6);
      // ACN 11 (Y_3^-1) mirror on sin → 0
      expect(c[11]).toBeCloseTo(0, 6);
      // All the m involving sin(el) vanish at el=0
      expect(c[10]).toBeCloseTo(0, 6); // Y_3^-2 ∝ sin(el)
      expect(c[12]).toBeCloseTo(0, 6); // Y_3^0  ∝ sin(el)
      expect(c[14]).toBeCloseTo(0, 6); // Y_3^2  ∝ sin(el)
    });

    it("placing sources at ±30° produces ACN 9/15 symmetric sin/cos(3·az)", () => {
      const cL = hoa3Coefficients(+30 * (Math.PI / 180), 0);
      const cR = hoa3Coefficients(-30 * (Math.PI / 180), 0);
      // 3az sign at ±30° → sin(3az) swaps sign
      expect(cL[9]).toBeCloseTo(-cR[9]!, 6);
      // cos(3az) symmetric
      expect(cL[15]).toBeCloseTo(cR[15]!, 6);
      // ACN 13 (cos·scale) symmetric — cos is even
      expect(cL[13]).toBeCloseTo(cR[13]!, 6);
      // ACN 11 (sin·scale) antisymmetric
      expect(cL[11]).toBeCloseTo(-cR[11]!, 6);
    });

    it("az=90° on horizon puts full magnitude on sin(3az) branch", () => {
      const c = hoa3Coefficients(Math.PI / 2, 0);
      // sin(3·90°) = sin(270°) = -1, cos(3·90°) = 0
      expect(c[9]).toBeCloseTo(-Math.sqrt(5 / 8), 6);
      expect(c[15]).toBeCloseTo(0, 6);
    });

    it("el=90° (zenith) collapses all m≠0 coefficients to 0", () => {
      // A source directly overhead has no azimuthal resolvability; only
      // the rotationally-symmetric m=0 channels (ACN 2, 6, 12) carry
      // energy, and only via the sin(el)/Legendre-in-x factor.
      const c = hoa3Coefficients(1.234, Math.PI / 2);
      // ACN 2 = sin(el) = 1
      expect(c[2]).toBeCloseTo(1, 6);
      // ACN 6 = (3·1 - 1)/2 = 1
      expect(c[6]).toBeCloseTo(1, 6);
      // ACN 12 = (5·1 - 3)·1 / 2 = 1
      expect(c[12]).toBeCloseTo(1, 6);
      // ACN 0 (omni) always 1
      expect(c[0]).toBeCloseTo(1, 6);
      // All m≠0 vanish because cos(el)=0
      for (const idx of [1, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 15]) {
        expect(c[idx]).toBeCloseTo(0, 6);
      }
    });

    it("el=-90° (nadir) flips the m=0 sign on odd-l channels", () => {
      // Odd-l m=0 SH are antisymmetric in elevation; at -90° the Z-axis
      // and ACN 12 (l=3 m=0) should flip sign from the +90° case.
      const up = hoa3Coefficients(0, Math.PI / 2);
      const down = hoa3Coefficients(0, -Math.PI / 2);
      expect(down[2]).toBeCloseTo(-up[2]!, 6); // l=1 m=0
      expect(down[12]).toBeCloseTo(-up[12]!, 6); // l=3 m=0
      // Even-l m=0 channels stay the same magnitude
      expect(down[6]).toBeCloseTo(up[6]!, 6); // l=2 m=0
    });
  });

  describe("buildHoa3PanGraph — ffmpeg filter graph", () => {
    it("returns 16 channels, asplit + 16 pan nodes + amerge", () => {
      const { panGraph, outLabel, channelCount } = buildHoa3PanGraph();
      expect(channelCount).toBe(16);
      expect(outLabel).toBe("[hoaOut]");
      expect(panGraph).toContain("[0:a]asplit=16");
      expect(panGraph).toContain("amerge=inputs=16");
      const panCount = (panGraph.match(/pan=mono\|c0=/g) ?? []).length;
      expect(panCount).toBe(16);
    });

    it("embeds the √(5/8) ≈ 0.790569 coefficient somewhere (ACN 9/15)", () => {
      const { panGraph } = buildHoa3PanGraph();
      expect(panGraph).toMatch(/0\.7905/);
    });
  });

  // ---------------------------------------------------------------------
  // HOA2 multi-source mix (amix) + temporal concat (acrossfade)
  // ---------------------------------------------------------------------

  describe("buildHoa2MixGraph — amix per-channel sum", () => {
    it("returns a 9-channel amix graph with N inputs and longest duration", () => {
      const { panGraph, outLabel, channelCount } = buildHoa2MixGraph(3);
      expect(channelCount).toBe(9);
      expect(outLabel).toBe("[hoaMixOut]");
      expect(panGraph).toContain("[0:a][1:a][2:a]");
      expect(panGraph).toContain("amix=inputs=3");
      expect(panGraph).toContain("duration=longest");
      // normalize=0 keeps the summation as-is (weights honoured),
      // normalize=1 would scale down by 1/N which we don't want for
      // ambisonic beds (the field energy should stay preserved).
      expect(panGraph).toContain("normalize=0");
    });

    it("honours explicit per-source weights when provided", () => {
      const { panGraph } = buildHoa2MixGraph(2, [1.0, 0.5]);
      expect(panGraph).toContain("weights='1.000000 0.500000'");
    });

    it("omits the weights clause when none given (ffmpeg default)", () => {
      const { panGraph } = buildHoa2MixGraph(2);
      expect(panGraph).not.toContain("weights=");
    });

    it("rejects a 0 or negative source count", () => {
      expect(() => buildHoa2MixGraph(0)).toThrow();
      expect(() => buildHoa2MixGraph(-1)).toThrow();
    });

    it("rejects a weights array of the wrong length", () => {
      expect(() => buildHoa2MixGraph(3, [1.0])).toThrow();
    });
  });

  describe("concatHoa2Clips — per-channel acrossfade", () => {
    it("forces both inputs to a named 9.0 layout before acrossfade", () => {
      const { panGraph, outLabel, channelCount } = concatHoa2Clips(1.5);
      expect(channelCount).toBe(9);
      expect(outLabel).toBe("[hoaXOut]");
      // Both input legs should be clamped via aformat to keep acrossfade
      // from rejecting mismatched-layout streams at filter compile time.
      expect(panGraph).toContain("[0:a]aformat=channel_layouts=9.0[a0]");
      expect(panGraph).toContain("[1:a]aformat=channel_layouts=9.0[a1]");
      expect(panGraph).toContain("acrossfade=d=1.500");
    });

    it("defaults to the triangular (linear) crossfade curve", () => {
      const { panGraph } = concatHoa2Clips(0.8);
      expect(panGraph).toContain("c1=tri");
      expect(panGraph).toContain("c2=tri");
    });

    it("accepts alternative curves like equal-power qsin", () => {
      const { panGraph } = concatHoa2Clips(2, "qsin");
      expect(panGraph).toContain("c1=qsin");
      expect(panGraph).toContain("c2=qsin");
    });

    it("rejects a non-positive duration", () => {
      expect(() => concatHoa2Clips(0)).toThrow();
      expect(() => concatHoa2Clips(-1)).toThrow();
    });
  });

  // ---------------------------------------------------------------------
  // HOA2 upmix from 5.1 surround — canonical-position projection
  // ---------------------------------------------------------------------

  describe("surround51ToHoa2Coefficients — per-channel SH projection", () => {
    it("FC maps to the front-centre HOA2 response (X = 1, Y = 0)", () => {
      const c = surround51ToHoa2Coefficients();
      // FC at az=0, el=0: X (ACN 3) = cos(0) = 1, Y (ACN 1) = sin(0) = 0
      expect(c.FC[3]).toBeCloseTo(1, 6);
      expect(c.FC[1]).toBeCloseTo(0, 6);
    });

    it("FL at +30° and FR at -30° are Y-axis mirror images", () => {
      const c = surround51ToHoa2Coefficients();
      // Y (ACN 1, = sin az) swaps sign between +30° and -30°
      expect(c.FL[1]).toBeCloseTo(-c.FR[1]!, 6);
      // X (ACN 3, = cos az) is identical
      expect(c.FL[3]).toBeCloseTo(c.FR[3]!, 6);
    });

    it("BL at +110° and BR at -110° produce NEGATIVE X (rear hemisphere)", () => {
      // This is the whole point of the 5.1 upmix: stereo can't encode
      // negative X because both L and R stay in the front hemisphere
      // (cos +30° = cos -30° > 0). A real 5.1 source brings BL/BR and
      // their cos(110°) ≈ -0.342 injects true rear energy into the HOA
      // field.
      const c = surround51ToHoa2Coefficients();
      expect(c.BL[3]).toBeLessThan(0);
      expect(c.BR[3]).toBeLessThan(0);
      expect(c.BL[3]).toBeCloseTo(Math.cos((110 * Math.PI) / 180), 6);
      expect(c.BR[3]).toBeCloseTo(Math.cos((-110 * Math.PI) / 180), 6);
    });

    it("LFE routes only to W (ACN 0) at 0.707 gain", () => {
      const c = surround51ToHoa2Coefficients();
      expect(c.LFE[0]).toBeCloseTo(0.707, 6);
      for (let i = 1; i < 9; i++) {
        expect(c.LFE[i]).toBe(0);
      }
    });

    it("BL and BR Y components are antisymmetric", () => {
      const c = surround51ToHoa2Coefficients();
      expect(c.BL[1]).toBeCloseTo(-c.BR[1]!, 6);
    });

    it("all input channels contribute 1.0 to W (omnidirectional bed), except LFE which is attenuated", () => {
      const c = surround51ToHoa2Coefficients();
      // ACN 0 (W) is always 1 for a directional SH source; LFE is the
      // only exception (deliberately scaled to 0.707).
      expect(c.FL[0]).toBeCloseTo(1, 6);
      expect(c.FR[0]).toBeCloseTo(1, 6);
      expect(c.FC[0]).toBeCloseTo(1, 6);
      expect(c.BL[0]).toBeCloseTo(1, 6);
      expect(c.BR[0]).toBeCloseTo(1, 6);
      expect(c.LFE[0]).toBeCloseTo(0.707, 6);
    });
  });

  describe("buildHoa2FromSurround51PanGraph — ffmpeg filter graph", () => {
    it("returns a 9-channel graph that references 5.1 named inputs", () => {
      const { panGraph, outLabel, channelCount } = buildHoa2FromSurround51PanGraph();
      expect(channelCount).toBe(9);
      expect(outLabel).toBe("[hoaOut]");
      expect(panGraph).toContain("[0:a]asplit=9");
      // Each of the 9 pan nodes must reference all 6 source channels by
      // name — otherwise rear info silently drops.
      const firstPan = panGraph.split(";")[1]!;
      for (const ch of ["FL", "FR", "FC", "LFE", "BL", "BR"]) {
        expect(firstPan).toContain(`*${ch}`);
      }
      expect(panGraph).toContain("amerge=inputs=9");
    });

    it("embeds the cos(110°) ≈ -0.342 rear factor in the X row", () => {
      // Sanity: rear info must reach the graph; if cos(110°) never shows
      // up, the BL/BR weights are silently zero and the upmix degrades
      // to stereo-quality.
      const { panGraph } = buildHoa2FromSurround51PanGraph();
      expect(panGraph).toMatch(/-0\.34/);
    });
  });
});
