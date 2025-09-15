import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

export async function POST(request) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return Response.json(
        { error: 'Prompt is required' }, 
        { status: 400 }
      );
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 512,
      top_p: 1,
      stream: false
    });

    const result = completion.choices[0].message.content.trim();
    
    return Response.json({ result });

  } catch (error) {
    console.error('Error calling Groq API:', error);
    
    return Response.json(
      { 
        error: 'Failed to analyze resume',
        details: error.message 
      }, 
      { status: 500 }
    );
  }
}