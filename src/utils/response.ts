export class ApiResponse {
  static success(data: any = null, message: string = 'Success') {
    return {
      success: true,
      message,
      data
    };
  }

  static error(message: string = 'Error', statusCode: number = 400) {
    return {
      success: false,
      message,
      statusCode
    };
  }

  static validationError(errors: any[]) {
    return {
      success: false,
      message: 'Validation Error',
      errors
    };
  }

  static serverError(message?: string) {
    return this.error('Internal server error', 500);
  }

  static notFound(message: string = 'Resource not found') {
    return this.error(message, 404);
  }

  static unauthorized(message: string = 'Unauthorized') {
    return this.error(message, 401);
  }

  static forbidden(message: string = 'Forbidden') {
    return this.error(message, 403);
  }
} 