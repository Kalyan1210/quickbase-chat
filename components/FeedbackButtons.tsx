'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, MessageSquare, X, Check, Loader2 } from 'lucide-react';

interface FeedbackButtonsProps {
  question: string;
  response: string;
  toolCalled?: string;
  toolParams?: Record<string, unknown>;
  dataReturned?: unknown;
  onFeedbackSubmit?: (isCorrect: boolean) => void;
}

export function FeedbackButtons({
  question,
  response,
  toolCalled,
  toolParams,
  dataReturned,
  onFeedbackSubmit,
}: FeedbackButtonsProps) {
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<'correct' | 'incorrect' | null>(null);
  const [comment, setComment] = useState('');
  const [correctedAnswer, setCorrectedAnswer] = useState('');

  const submitFeedback = async (isCorrect: boolean) => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          aiResponse: response,
          toolCalled,
          toolParams,
          dataReturned,
          isCorrect,
          userComment: comment || null,
          correctedAnswer: correctedAnswer || null,
        }),
      });

      if (res.ok) {
        setSubmitted(isCorrect ? 'correct' : 'incorrect');
        setShowForm(false);
        onFeedbackSubmit?.(isCorrect);
      } else {
        console.error('Failed to submit feedback');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Already submitted
  if (submitted) {
    return (
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
        <Check className="w-4 h-4 text-green-500" />
        <span className="text-xs text-gray-500">
          Thanks for your feedback!
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      {!showForm ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Was this helpful?</span>
          <button
            onClick={() => submitFeedback(true)}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors"
            title="Yes, this was helpful"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ThumbsUp className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => setShowForm(true)}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
            title="No, this needs improvement"
          >
            <ThumbsDown className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Help us improve</span>
            <button
              onClick={() => setShowForm(false)}
              className="p-1 rounded hover:bg-gray-100"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              What should the correct answer be? (optional)
            </label>
            <textarea
              value={correctedAnswer}
              onChange={(e) => setCorrectedAnswer(e.target.value)}
              placeholder="E.g., 'There are actually 150 enrolled families, not 145...'"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={2}
            />
          </div>
          
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Any additional comments? (optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="E.g., 'The count seems off' or 'Wrong table used'"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={2}
            />
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => submitFeedback(false)}
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" />
                  Submit Feedback
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default FeedbackButtons;

