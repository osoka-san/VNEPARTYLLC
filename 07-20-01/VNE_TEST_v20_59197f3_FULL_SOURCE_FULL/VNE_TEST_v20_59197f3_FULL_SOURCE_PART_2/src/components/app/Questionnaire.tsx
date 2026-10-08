import { useId, useRef } from "react";
import { ArrowLeft, PencilLine } from "lucide-react";
import { BloomAnswerMenu } from "./BloomAnswerMenu";
import { WaveSlider } from "./WaveSlider";
import { AgeWheelPicker } from "./AgeWheelPicker";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import {
  QUESTIONNAIRE_MAX_LENGTH,
  QUESTIONNAIRE_MAX_WORDS,
  QUESTIONNAIRE_MAX_ANSWERS,
  QUESTIONNAIRE_QUESTIONS,
  QUESTIONNAIRE_RATING_QUESTIONS,
  countQuestionnaireWords,
  getQuestionnaireAnswer,
  getQuestionnaireValues,
  serializeQuestionnaire,
  setQuestionnaireMode,
  validateQuestionnaire,
  type QuestionnaireAnswer,
  type QuestionnaireId,
  type QuestionnaireState,
} from "@/lib/questionnaire";
import "./questionnaire.css";

export { createQuestionnaireState } from "@/lib/questionnaire";
export type { QuestionnaireState } from "@/lib/questionnaire";

type QuestionnaireProps = {
  value: QuestionnaireState;
  onChange: (value: QuestionnaireState) => void;
  disabled?: boolean;
  showModeToggle?: boolean;
  showRequiredErrors?: boolean;
};

export function QuestionnaireModeToggle({
  value,
  onChange,
  disabled = false,
}: Omit<QuestionnaireProps, "showModeToggle">) {
  const manual = value.mode === "manual";
  return (
    <div className="vne-questionnaire-mode">
      <button
        type="button"
        className="vne-questionnaire-mode-button"
        disabled={disabled}
        aria-pressed={manual}
        aria-controls="vne-questionnaire"
        onClick={() => onChange(setQuestionnaireMode(value, manual ? "choices" : "manual"))}
      >
        {manual ? (
          <ArrowLeft size={17} aria-hidden="true" />
        ) : (
          <PencilLine size={17} aria-hidden="true" />
        )}
        <span>
          {manual ? "Вернуться к выбору вариантов" : "Ввести анкетные данные самостоятельно"}
        </span>
      </button>
      <p>Оба режима сохраняют свои ответы. Отправится текущий.</p>
    </div>
  );
}

export function Questionnaire({
  value,
  onChange,
  disabled = false,
  showModeToggle = true,
  showRequiredErrors = false,
}: QuestionnaireProps) {
  const uid = useId();
  const inputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const { reduced, settings } = useMotionEnv();
  const motionEnabled = !reduced && settings.menuMotion && settings.duration > 0;
  const errors = validateQuestionnaire(value, { requireAll: showRequiredErrors });
  const answered =
    serializeQuestionnaire(value).length +
    QUESTIONNAIRE_RATING_QUESTIONS.filter(({ id }) => value.ratings?.[id] != null).length;
  const total = QUESTIONNAIRE_QUESTIONS.length + QUESTIONNAIRE_RATING_QUESTIONS.length;
  const manual = value.mode === "manual";

  const updateAnswer = (id: QuestionnaireId, patch: Partial<QuestionnaireAnswer>) =>
    onChange({
      ...value,
      answers: { ...value.answers, [id]: { ...value.answers[id], ...patch } },
    });

  return (
    <section
      id="vne-questionnaire"
      className="vne-questionnaire"
      aria-labelledby={`${uid}-heading`}
      data-motion={motionEnabled}
    >
      {showModeToggle && (
        <QuestionnaireModeToggle value={value} onChange={onChange} disabled={disabled} />
      )}
      <div className="vne-questionnaire-heading">
        <div>
          <p className="vne-questionnaire-eyebrow">ВНЕ / немного о тебе</p>
          <h2 id={`${uid}-heading`}>С чего начнём знакомство?</h2>
        </div>
        <span className="vne-questionnaire-count" aria-label={`Ответов: ${answered} из ${total}`}>
          {String(answered).padStart(2, "0")} <span>/ {total}</span>
        </span>
      </div>
      <p className="vne-questionnaire-intro">
        Семь вопросов для знакомства и три шкалы настроения. На каждый короткий вопрос выбери от 1
        до 3 ответов в сумме, включая свой. В каждом ответе хватит 1–5 слов. Заполни все вопросы,
        три шкалы и возраст.
      </p>
      <div className="vne-questionnaire-progress" aria-hidden="true">
        {QUESTIONNAIRE_QUESTIONS.map(({ id }) => (
          <span key={id} data-filled={!!getQuestionnaireAnswer(value, id).trim()} />
        ))}
        {QUESTIONNAIRE_RATING_QUESTIONS.map(({ id }) => (
          <span key={id} data-filled={value.ratings?.[id] != null} />
        ))}
      </div>
      <div className="vne-questionnaire-cards">
        {QUESTIONNAIRE_QUESTIONS.map(({ id, question, options }, index) => {
          const answer = value.answers[id];
          const activeValues = getQuestionnaireValues(value, id);
          const selectedCount = answer.selected.length + Number(answer.useCustom);
          const savedManual = answer.manual ?? [
            ...answer.selected,
            ...(answer.useCustom ? [answer.custom] : []),
          ];
          const manualFields = savedManual.length ? savedManual : [""];
          const fields = manual ? manualFields : answer.useCustom ? [answer.custom] : [];
          const hasDraft = manual ? fields.some((text) => text.length) : selectedCount > 0;
          const titleId = `${uid}-${id}-title`;
          const errorId = `${uid}-${id}-error`;
          return (
            <div
              className="vne-questionnaire-card"
              key={id}
              data-answered={activeValues.length > 0}
            >
              <div className="vne-questionnaire-card-top">
                <span className="vne-questionnaire-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 id={titleId}>{question}</h3>
              </div>
              {!manual && (
                <div className="vne-questionnaire-choice-row">
                  <BloomAnswerMenu
                    question={question}
                    labelledBy={titleId}
                    options={options}
                    selected={answer.selected}
                    custom={answer.useCustom}
                    onSelect={(selected) => {
                      if (answer.selected.includes(selected)) {
                        updateAnswer(id, {
                          selected: answer.selected.filter((option) => option !== selected),
                        });
                      } else if (selectedCount < QUESTIONNAIRE_MAX_ANSWERS) {
                        updateAnswer(id, { selected: [...answer.selected, selected] });
                      }
                    }}
                    onCustom={(useCustom) => {
                      if (!useCustom || selectedCount < QUESTIONNAIRE_MAX_ANSWERS)
                        updateAnswer(id, { useCustom });
                    }}
                    onCustomFocus={() => inputRefs.current[`${id}-0`]?.focus()}
                    disabled={disabled}
                    motionEnabled={motionEnabled}
                    invalid={!!errors[id] && fields.length === 0}
                    describedBy={errors[id] && fields.length === 0 ? errorId : undefined}
                  />
                </div>
              )}
              {fields.map((text, fieldIndex) => {
                const inputId = `${uid}-${id}-input-${fieldIndex}`;
                const helpId = `${inputId}-help`;
                const wordCount = countQuestionnaireWords(text);
                const fieldInvalid =
                  wordCount > QUESTIONNAIRE_MAX_WORDS ||
                  text.length > QUESTIONNAIRE_MAX_LENGTH ||
                  (!manual && !text.trim()) ||
                  (!!errors[id] &&
                    fieldIndex === 0 &&
                    (!activeValues.length || fields.length > QUESTIONNAIRE_MAX_ANSWERS));
                return (
                  <div className="vne-questionnaire-write" key={fieldIndex}>
                    <div className="vne-questionnaire-field-heading">
                      <label
                        className="vne-questionnaire-input-label"
                        id={`${inputId}-label`}
                        htmlFor={inputId}
                      >
                        {manual ? `Ответ ${fieldIndex + 1}` : "Свой ответ"}
                      </label>
                      {manual && fields.length > 1 && (
                        <button
                          type="button"
                          disabled={disabled}
                          className="vne-questionnaire-remove-answer"
                          aria-label={`Убрать ответ ${fieldIndex + 1}: ${question}`}
                          onClick={() => {
                            updateAnswer(id, {
                              manual: manualFields.filter((_, at) => at !== fieldIndex),
                            });
                            requestAnimationFrame(() =>
                              inputRefs.current[`${id}-${Math.max(0, fieldIndex - 1)}`]?.focus(),
                            );
                          }}
                        >
                          Убрать
                        </button>
                      )}
                    </div>
                    <textarea
                      ref={(node) => {
                        inputRefs.current[`${id}-${fieldIndex}`] = node;
                      }}
                      id={inputId}
                      value={text}
                      onChange={(event) => {
                        if (manual) {
                          updateAnswer(id, {
                            manual: manualFields.map((current, at) =>
                              at === fieldIndex ? event.target.value : current,
                            ),
                          });
                        } else {
                          updateAnswer(id, { custom: event.target.value });
                        }
                      }}
                      disabled={disabled}
                      rows={2}
                      maxLength={QUESTIONNAIRE_MAX_LENGTH}
                      placeholder="Так, как ты это чувствуешь"
                      aria-labelledby={`${titleId} ${inputId}-label`}
                      aria-describedby={fieldInvalid ? `${helpId} ${errorId}` : helpId}
                      aria-invalid={fieldInvalid}
                    />
                    <div className="vne-questionnaire-input-help" id={helpId}>
                      <span>До 5 слов · 120 символов</span>
                      <span data-invalid={wordCount > QUESTIONNAIRE_MAX_WORDS}>
                        {wordCount} / {QUESTIONNAIRE_MAX_WORDS} слов
                      </span>
                    </div>
                  </div>
                );
              })}
              {manual && manualFields.length < QUESTIONNAIRE_MAX_ANSWERS && (
                <button
                  type="button"
                  className="vne-questionnaire-add-answer"
                  disabled={disabled}
                  onClick={() => {
                    updateAnswer(id, { manual: [...manualFields, ""] });
                    requestAnimationFrame(() =>
                      inputRefs.current[`${id}-${manualFields.length}`]?.focus(),
                    );
                  }}
                >
                  Добавить ответ · {manualFields.length}/{QUESTIONNAIRE_MAX_ANSWERS}
                </button>
              )}
              {errors[id] && (
                <p id={errorId} className="vne-questionnaire-error" role="status">
                  {errors[id]}
                </p>
              )}
              <div className="vne-questionnaire-card-bottom">
                <span>
                  {activeValues.length
                    ? `Ответов: ${activeValues.length} из ${QUESTIONNAIRE_MAX_ANSWERS}`
                    : "Нужен хотя бы один ответ"}
                </span>
                <button
                  type="button"
                  className="vne-questionnaire-clear"
                  onClick={() =>
                    updateAnswer(id, manual ? { manual: [""] } : { selected: [], useCustom: false })
                  }
                  disabled={disabled || !hasDraft}
                  aria-label={`Очистить ответы: ${question}`}
                >
                  Очистить
                </button>
              </div>
            </div>
          );
        })}
        {QUESTIONNAIRE_RATING_QUESTIONS.map(({ id, question, minLabel, maxLabel }, index) => (
          <div
            className="vne-questionnaire-card vne-questionnaire-rating-card"
            key={id}
            data-answered={value.ratings?.[id] != null}
          >
            <div className="vne-questionnaire-card-top">
              <span className="vne-questionnaire-number" aria-hidden="true">
                {String(QUESTIONNAIRE_QUESTIONS.length + index + 1).padStart(2, "0")}
              </span>
              <h3 id={`${uid}-${id}-title`}>{question}</h3>
            </div>
            <WaveSlider
              id={`${uid}-${id}-range`}
              label={question}
              labelledBy={`${uid}-${id}-title`}
              minLabel={minLabel}
              maxLabel={maxLabel}
              value={value.ratings?.[id] ?? null}
              onChange={(rating) =>
                onChange({ ...value, ratings: { ...value.ratings, [id]: rating } })
              }
              disabled={disabled}
              motionEnabled={motionEnabled}
              required
              error={errors[id]}
            />
          </div>
        ))}
      </div>
      <div
        className="vne-questionnaire-age"
        role="group"
        aria-labelledby={`${uid}-age-title`}
        aria-invalid={!!errors.age}
        aria-describedby={errors.age ? `${uid}-age-error` : undefined}
        tabIndex={errors.age ? -1 : undefined}
      >
        <div>
          <h3 id={`${uid}-age-title`}>Возраст</h3>
          <p>Укажи возраст и подтверди выбор.</p>
        </div>
        <AgeWheelPicker
          value={value.age ?? null}
          onChange={(age) => onChange({ ...value, age })}
          disabled={disabled}
          required
        />
        {errors.age && (
          <p id={`${uid}-age-error`} className="vne-questionnaire-error" role="status">
            {errors.age}
          </p>
        )}
      </div>
      <p className="vne-questionnaire-footer">
        Здесь нет правильных ответов. Нам интересно, как тебе комфортно.
      </p>
    </section>
  );
}
