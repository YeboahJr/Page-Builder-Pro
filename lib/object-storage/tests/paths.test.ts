import { describe, expect, it } from "vitest";
import {
  evidenceCaseListPrefix,
  evidenceListPrefix,
  evidenceObjectName,
  evidenceObjectPath,
  parseEvidenceRelativePath,
  parsePrivateObjectDir,
  relativeToGcsPrefix,
} from "../src/paths";

describe("parsePrivateObjectDir", () => {
  it("splits bucket and prefix when a prefix is present", () => {
    expect(parsePrivateObjectDir("/my-bucket/.private")).toEqual({
      bucketName: "my-bucket",
      gcsPrefix: ".private",
    });
  });

  it("keeps nested prefixes intact", () => {
    expect(parsePrivateObjectDir("/my-bucket/.private/evidence")).toEqual({
      bucketName: "my-bucket",
      gcsPrefix: ".private/evidence",
    });
  });

  it("returns an empty prefix when the dir is only a bucket", () => {
    expect(parsePrivateObjectDir("/my-bucket")).toEqual({
      bucketName: "my-bucket",
      gcsPrefix: "",
    });
  });

  it("works without a leading slash", () => {
    expect(parsePrivateObjectDir("my-bucket/.private")).toEqual({
      bucketName: "my-bucket",
      gcsPrefix: ".private",
    });
  });
});

describe("evidenceObjectName", () => {
  it("prepends the gcs prefix when present", () => {
    expect(evidenceObjectName(".private", 42, "photo.jpg")).toBe(
      ".private/case-42/photo.jpg"
    );
  });

  it("omits the prefix when it is empty", () => {
    expect(evidenceObjectName("", 42, "photo.jpg")).toBe("case-42/photo.jpg");
  });

  it("accepts string case ids", () => {
    expect(evidenceObjectName(".private", "7", "a.pdf")).toBe(
      ".private/case-7/a.pdf"
    );
  });
});

describe("evidenceCaseListPrefix", () => {
  it("ends with a trailing slash and includes the prefix", () => {
    expect(evidenceCaseListPrefix(".private", 42)).toBe(".private/case-42/");
  });

  it("omits the prefix when it is empty", () => {
    expect(evidenceCaseListPrefix("", 42)).toBe("case-42/");
  });

  it("covers exactly the objects created by evidenceObjectName for that case", () => {
    const name = evidenceObjectName(".private", 42, "photo.jpg");
    const otherCase = evidenceObjectName(".private", 421, "photo.jpg");
    const prefix = evidenceCaseListPrefix(".private", 42);
    expect(name.startsWith(prefix)).toBe(true);
    expect(otherCase.startsWith(prefix)).toBe(false);
  });
});

describe("evidenceListPrefix", () => {
  it("returns the prefix with a trailing slash", () => {
    expect(evidenceListPrefix(".private")).toBe(".private/");
  });

  it("returns an empty string for an empty prefix", () => {
    expect(evidenceListPrefix("")).toBe("");
  });

  it("covers every evidence object name", () => {
    const name = evidenceObjectName(".private", 5, "doc.pdf");
    expect(name.startsWith(evidenceListPrefix(".private"))).toBe(true);
  });
});

describe("evidenceObjectPath", () => {
  it("builds the app-side /objects path", () => {
    expect(evidenceObjectPath(42, "photo.jpg")).toBe(
      "/objects/case-42/photo.jpg"
    );
  });
});

describe("relativeToGcsPrefix", () => {
  it("strips the prefix and its slash", () => {
    expect(relativeToGcsPrefix(".private", ".private/case-42/photo.jpg")).toBe(
      "case-42/photo.jpg"
    );
  });

  it("returns the name unchanged for an empty prefix", () => {
    expect(relativeToGcsPrefix("", "case-42/photo.jpg")).toBe(
      "case-42/photo.jpg"
    );
  });
});

describe("parseEvidenceRelativePath", () => {
  it("parses a matching case-relative path", () => {
    expect(parseEvidenceRelativePath("case-42/photo.jpg")).toEqual({
      caseId: 42,
      filename: "photo.jpg",
    });
  });

  it("keeps nested filenames intact", () => {
    expect(parseEvidenceRelativePath("case-42/sub/photo.jpg")).toEqual({
      caseId: 42,
      filename: "sub/photo.jpg",
    });
  });

  it("returns null for non-matching names", () => {
    expect(parseEvidenceRelativePath("uploads/photo.jpg")).toBeNull();
    expect(parseEvidenceRelativePath("case-abc/photo.jpg")).toBeNull();
    expect(parseEvidenceRelativePath("case-42")).toBeNull();
  });

  it("returns null for directory-placeholder names ending in a slash", () => {
    expect(parseEvidenceRelativePath("case-42/")).toBeNull();
    expect(parseEvidenceRelativePath("case-42/folder/")).toBeNull();
  });
});

describe("GCS name and app path stay consistent", () => {
  const cases: Array<[string, number, string]> = [
    [".private", 42, "photo.jpg"],
    [".private/evidence", 7, "report v2 (final).pdf"],
    ["", 1, "a.txt"],
  ];

  it.each(cases)(
    "round-trips prefix=%j caseId=%j filename=%j",
    (gcsPrefix, caseId, filename) => {
      const objectName = evidenceObjectName(gcsPrefix, caseId, filename);
      const relative = relativeToGcsPrefix(gcsPrefix, objectName);
      const parsed = parseEvidenceRelativePath(relative);

      expect(parsed).toEqual({ caseId, filename });

      // The app-side path stored in the DB must reference the same
      // case + filename the GCS object name encodes.
      expect(evidenceObjectPath(parsed!.caseId, parsed!.filename)).toBe(
        evidenceObjectPath(caseId, filename)
      );
      expect(evidenceObjectPath(caseId, filename)).toBe(
        `/objects/${relative}`
      );
    }
  );
});
