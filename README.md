# Tryout Scripts


## Installation



## Usage - Localization WorldServer Markcomplete Tool

```
Get the Token - Login to https://ws-stage...... In the network filter for "check" call 
(wait for few mins for it appear). In the request header get the value of key "Token". e.g 20......34
```
```
Open developer console load the scripts in console
var script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/gh/raga-adbe-gh/tryout_public@main/miloLocWSTool9.js';
document.body.appendChild(script);
```

```
Initialize via the user id
var wstool = new MiloLocWSTool(20....34);

```

```
To check that project exists run the
wstool.getProjects('<part of project key>');
(WSUPDATE - is example the part of the project key )

```

```
console logs should be similar to.
 Array [ "Projects [23..4,23..5]" ]
```

```
Trigger the update (it could take a while..)
   wstool.wsUpdate('WSUPDATE');
   Wait for "Fragments Updated" message
```


## Contributing

Pull requests are welcome. For major changes, please open an issue first
to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License
