"use client";

import { useEffect, useState } from "react";

/**
 * Typewriter effect that cycles through a list of words/phrases.
 * Each word types in character-by-character, holds, then deletes
 * before moving to the next.
 *
 * Used on the Hero headline for a dynamic, AI-generator feel.
 */
export default function TypeWriter({
  words,
  typingSpeed = 80,
  deletingSpeed = 40,
  holdTime = 2000,
  className,
}: {
  words: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  holdTime?: number;
  className?: string;
}) {
  const [wordIndex, setWordIndex] = useState(0);
  const [text, setText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentWord = words[wordIndex];

    if (!isDeleting && text === currentWord) {
      // Hold, then start deleting.
      const timer = setTimeout(() => setIsDeleting(true), holdTime);
      return () => clearTimeout(timer);
    }

    if (isDeleting && text === "") {
      // Move to next word.
      setIsDeleting(false);
      setWordIndex((i) => (i + 1) % words.length);
      return;
    }

    const speed = isDeleting ? deletingSpeed : typingSpeed;
    const timer = setTimeout(() => {
      setText((prev) =>
        isDeleting
          ? prev.slice(0, -1)
          : currentWord.slice(0, prev.length + 1)
      );
    }, speed);

    return () => clearTimeout(timer);
  }, [text, isDeleting, wordIndex, words, typingSpeed, deletingSpeed, holdTime]);

  return (
    <span className={className}>
      {text}
      <span className="animate-pulse text-flex-accent">|</span>
    </span>
  );
}
