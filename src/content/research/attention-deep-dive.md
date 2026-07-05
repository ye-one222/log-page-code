---
publish: true
title: Attention은 왜 잘 될까 — 수식으로 뜯어보기
date: 2026-06-15
type: note
summary: Q·K·V를 검색 시스템 비유로 이해하고, softmax 온도가 하는 일을 직접 그려봤다.
tags: [deep-learning, transformer]
---

> 샘플 글입니다. 지식 기록은 논문 단위가 아닌 개념 단위로 씁니다.

## 검색 시스템으로서의 attention

Query는 검색어, Key는 색인, Value는 문서 본문이다.

## Softmax 온도의 역할

√d로 나누지 않으면 어떤 일이 벌어지는지 간단한 시각화로 확인해 보자.
