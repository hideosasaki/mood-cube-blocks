# package.json は pxt が生成する副産物で gitignore されているため、
# npm scripts ではなく Makefile でタスクをまとめる。

# exact pin にしておくと npx がレジストリ解決なしにキャッシュから起動できる。
# バージョンを上げるときは tests/local/tsconfig.json の ignoreDeprecations も合わせること
# (outFile + namespace 連結は TS6 で deprecated、TS7 で削除予定)
TSC = npx --yes -p typescript@6.0.3 tsc

# ローカル (node) でピュアロジックテストを実行する
test:
	$(TSC) -p tests/local
	node built/local-test.js

# P0計測ツール (tools/measure) をビルドしてユニットテストを実行する
measure:
	$(TSC) -p tools/measure
	node --test built/measure/lib.test.js

# MakeCode コンパイラでの型チェック + ローカルテスト
check:
	pxt build
	$(MAKE) test
	$(MAKE) measure

.PHONY: test check measure
