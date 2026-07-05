---
publish: true
title: 3D Gaussian Splatting 다시 읽기
date: 2026-06-28
type: paper
venue: SIGGRAPH 2023
summary: NeRF의 병목을 어떻게 뒤집었는지, 명시적 표현으로의 회귀가 왜 통했는지 정리했다.
tags: [3d-vision, rendering]
---

> 이 글은 샘플입니다. 실제 리뷰로 교체하세요. 아래 구조(문제 → 한계 → 핵심 아이디어 → 실험 → 내 생각)를 템플릿으로 쓰면 됩니다.

## 어떤 문제를 푸는가

Novel view synthesis에서 NeRF 계열은 품질은 좋지만 학습과 렌더링이 느리다.

## 기존 방법의 한계

암시적(implicit) 표현은 레이 마칭 비용을 피할 수 없다.

## 핵심 아이디어

장면을 3D 가우시안의 집합으로 명시적으로 표현하고, 미분 가능한 래스터라이저로 실시간 렌더링을 달성한다.

## 실험 결과

Mip-NeRF360 대비 동급 품질에서 실시간 FPS를 달성.

## 내 생각

"명시적 표현으로의 회귀"라는 흐름이 흥미롭다. 다음에 읽을 것: 4DGS.
