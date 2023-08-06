// This function exists to prevent Chrome from logging an error about
// closed conduit. It just sends a dummy message in response to incomming message
// to utilise open conduit. This response message is not even used on the other side.
export function makeChromiumHappy(): void {
    return;
}
