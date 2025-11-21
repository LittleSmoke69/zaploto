import { NextResponse } from 'next/server';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export function successResponse<T>(data: T, message?: string, status: number = 200): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data,
      message,
    } as ApiResponse<T>,
    { status }
  );
}

export function errorResponse(error: string | Error, status: number = 400): NextResponse {
  const errorMessage = error instanceof Error ? error.message : error;
  return NextResponse.json(
    {
      success: false,
      error: errorMessage,
    } as ApiResponse,
    { status }
  );
}

export function serverErrorResponse(error: string | Error): NextResponse {
  return errorResponse(error, 500);
}

