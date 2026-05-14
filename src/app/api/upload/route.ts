import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { Env } from '@/lib/types';

export const runtime = 'edge';

export async function POST(request: Request) {
    try {
        const { env } = (getRequestContext() as unknown) as { env: Env };
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const fileName = `${crypto.randomUUID()}-${file.name}`;
        
        // Upload to R2
        await env.R2_ASSETS.put(fileName, file.stream(), {
            httpMetadata: { contentType: file.type }
        });

        // In a real app, we'd have a public URL or a worker to serve these
        const publicUrl = `https://assets.binbutlersnc.com/${fileName}`;

        return NextResponse.json({ url: publicUrl, fileName });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
