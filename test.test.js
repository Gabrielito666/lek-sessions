const useLekSessions = require('.');

const main = async() =>
{
    const { create, confirm } = await useLekSessions();

    const myCookie = await create('este-es-un-super-id');

    console.log(myCookie);

    const UserId = await confirm(myCookie);
    const myNotUserId = await confirm('a-false-key');

    console.log(UserId);
    console.log(myNotUserId);

    await new Promise(res => setInterval(res, 5000));

    console.log(myCookie);

    const UserId2 = await confirm(myCookie);
    const myNotUserId2 = await confirm('a-false-key');

    console.log(UserId2);
    console.log(myNotUserId2);


}
main();