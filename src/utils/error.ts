interface ErrorObj {
    name?: string;
    message?: string;
    err?: any;
}

export function throwError(errorObj: ErrorObj): void {
    const {
        name = 'modify-darkreader: ',
        err,
        message,
    } = errorObj;

    console.error(name, message, err);
}
