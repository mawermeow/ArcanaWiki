import assert from "node:assert/strict";
import test from "node:test";

import { hasStructuredAnswerBody, parseAnswerBody } from "../../lib/answer/answer-body.ts";

test("parseAnswerBody splits numbered sections, paragraphs, and bullet lists", () => {
  const blocks = parseAnswerBody(
    [
      "1. 簡短總結",
      "你的卡牌顯示你目前可能感受到阻礙。",
      "",
      "2. 牌面/象徵解讀",
      "- 魔術師逆位：代表你可能目前沒有充分運用自己的能力。",
      "- 正義逆位：象徵內心可能感到不平衡。",
      "",
      "3. 與問題的關聯",
      "你問是否明天早起吃卡拉雞腿漢堡當早餐。"
    ].join("\n")
  );

  assert.deepEqual(blocks, [
    { type: "section", title: "簡短總結" },
    { type: "paragraph", text: "你的卡牌顯示你目前可能感受到阻礙。" },
    { type: "section", title: "牌面/象徵解讀" },
    {
      type: "list",
      items: [
        "魔術師逆位：代表你可能目前沒有充分運用自己的能力。",
        "正義逆位：象徵內心可能感到不平衡。"
      ]
    },
    { type: "section", title: "與問題的關聯" },
    { type: "paragraph", text: "你問是否明天早起吃卡拉雞腿漢堡當早餐。" }
  ]);
});

test("hasStructuredAnswerBody detects sections and lists", () => {
  assert.equal(hasStructuredAnswerBody("1. 簡短總結\n段落。"), true);
  assert.equal(hasStructuredAnswerBody("- 第一點\n- 第二點"), true);
  assert.equal(hasStructuredAnswerBody("可能反映關係失衡。"), false);
});
