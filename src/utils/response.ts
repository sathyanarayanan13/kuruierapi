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

  static unauthorized(message: string = 'Unauthorized') {
    return {
      success: false,
      message,
      statusCode: 401
    };
  }

  static forbidden(message: string = 'Forbidden') {
    return {
      success: false,
      message,
      statusCode: 403
    };
  }

  static notFound(message: string = 'Not Found') {
    return {
      success: false,
      message,
      statusCode: 404
    };
  }

  static serverError(message: string = 'Internal Server Error') {
    return {
      success: false,
      message,
      statusCode: 500
    };
  }
} 