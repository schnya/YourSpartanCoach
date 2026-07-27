import fs from "node:fs/promises";

/**
 * 指定されたパスリストを順番に読み込み、最初に成功したファイルの内容を返す。
 * すべて失敗した場合は defaultText を返す。
 */
export async function readFileWithFallback(
	candidatePaths: string[],
	defaultText: string,
): Promise<string> {
	for (const filePath of candidatePaths) {
		try {
			return await fs.readFile(filePath, "utf-8");
		} catch {
			// 次の候補パスの試行へ
		}
	}
	return defaultText;
}
