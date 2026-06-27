import { useState } from 'react';
import { Card } from './components/Card';
import { Button } from './components/Button';
import { Slider } from './components/Slider';

export default function App() {
  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [focus, setFocus] = useState<1 | 2 | 3 | 4 | 5>(4);

  return (
    <main style={{ padding: '24px', maxWidth: '480px', margin: '0 auto' }}>
      <h1 style={{ fontSize: 'var(--fs-headline-lg)', marginBottom: '16px' }}>凝时 Zept</h1>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Slider.Dual
            mood={mood}
            focus={focus}
            onMoodChange={setMood}
            onFocusChange={setFocus}
          />
          <Button onClick={() => undefined}>开始专注</Button>
        </div>
      </Card>
    </main>
  );
}
