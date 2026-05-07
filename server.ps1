param(
  [int]$Port = 4173
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir = Join-Path $Root "data"
$DbFile = Join-Path $DataDir "db.json"

function New-Seed {
  return [ordered]@{
    users = @(
      [ordered]@{ id = "u-100"; name = "Customer Demo"; email = "customer@quick.app"; phone = "+254700123456"; password = ""; role = "customer" },
      [ordered]@{ id = "u-200"; name = "Amina Rider"; idNumber = "12345678"; email = "driver@quick.app"; phone = "+254722456789"; password = "demo123"; role = "driver"; vehicle = "Bodaboda"; numberPlate = "KDA 123B"; vehicleColor = "Green"; passportPhoto = ""; location = [ordered]@{ lat = -1.2648; lng = 36.8024; label = "Westlands" }; approved = $true },
      [ordered]@{ id = "u-300"; name = "Admin Demo"; email = "admin@quick.app"; password = "demo123"; role = "admin" },
      [ordered]@{ id = "u-301"; name = "Raphael Mesa"; email = "raphaelmesa27@gmail.com"; password = "demo123"; role = "admin" }
    )
    bookings = @(
      [ordered]@{ id = "BK-1001"; customerId = "u-100"; customerName = "Customer Demo"; customerEmail = "customer@quick.app"; customerPhone = "+254700123456"; driverId = "u-200"; driverName = "Amina Rider"; driverPhone = "+254722456789"; driverVehicle = "Bodaboda"; driverNumberPlate = "KDA 123B"; driverVehicleColor = "Green"; driverPassportPhoto = ""; driverLocation = [ordered]@{ lat = -1.2648; lng = 36.8024; label = "Westlands" }; pickupLocation = [ordered]@{ lat = -1.2921; lng = 36.7856; label = "Kilimani" }; service = "boda"; pickup = "Kilimani"; destination = "Upper Hill"; time = "Now"; price = 210; status = "accepted"; createdAt = (Get-Date).ToString("o") },
      [ordered]@{ id = "BK-1002"; customerId = "u-100"; customerName = "Customer Demo"; customerEmail = "customer@quick.app"; customerPhone = "+254700123456"; driverId = $null; driverName = ""; driverPhone = ""; driverVehicle = ""; driverNumberPlate = ""; driverVehicleColor = ""; driverPassportPhoto = ""; pickupLocation = [ordered]@{ lat = -1.2648; lng = 36.8024; label = "Westlands" }; service = "courier"; pickup = "Westlands"; destination = "Industrial Area"; time = "In 30 minutes"; price = 340; status = "pending"; createdAt = (Get-Date).ToString("o") }
    )
    sessions = [ordered]@{}
  }
}

function Ensure-Db {
  if (!(Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir | Out-Null }
  if (!(Test-Path $DbFile)) { New-Seed | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $DbFile }
}

function Read-Db {
  Ensure-Db
  return Get-Content $DbFile -Raw | ConvertFrom-Json
}

function Write-Db($Db) {
  $Db | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $DbFile
}

function Send-Json($Response, [int]$Status, $Payload) {
  $json = $Payload | ConvertTo-Json -Depth 8
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $Response.StatusCode = $Status
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.Headers.Add("Access-Control-Allow-Origin", "*")
  $Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")
  $Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.Close()
}

function Read-Body($Request) {
  $reader = New-Object IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
  $raw = $reader.ReadToEnd()
  if ([string]::IsNullOrWhiteSpace($raw)) { return [pscustomobject]@{} }
  return $raw | ConvertFrom-Json
}

function Public-User($User) {
  return [ordered]@{ id = $User.id; name = $User.name; idNumber = $User.idNumber; email = $User.email; phone = $User.phone; role = $User.role; vehicle = $User.vehicle; numberPlate = $User.numberPlate; vehicleColor = $User.vehicleColor; passportPhoto = $User.passportPhoto; approved = $User.approved }
}

function New-Token {
  $bytes = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Get-AuthUser($Request, $Db) {
  $header = $Request.Headers["Authorization"]
  if (!$header -or !$header.StartsWith("Bearer ")) { return $null }
  $token = $header.Substring(7)
  $userId = $Db.sessions.$token
  if (!$userId) { return $null }
  return @($Db.users | Where-Object { $_.id -eq $userId })[0]
}

function Enrich-Booking($Db, $Booking) {
  $customer = @($Db.users | Where-Object { $_.id -eq $Booking.customerId })[0]
  $driver = @($Db.users | Where-Object { $_.id -eq $Booking.driverId })[0]
  return [ordered]@{
    id = $Booking.id
    customerId = $Booking.customerId
    customerName = $(if ($Booking.customerName) { $Booking.customerName } elseif ($customer) { $customer.name } else { "" })
    customerEmail = $(if ($Booking.customerEmail) { $Booking.customerEmail } elseif ($customer) { $customer.email } else { "" })
    customerPhone = $(if ($Booking.customerPhone) { $Booking.customerPhone } elseif ($customer) { $customer.phone } else { "" })
    driverId = $Booking.driverId
    driverName = $(if ($Booking.driverName) { $Booking.driverName } elseif ($driver) { $driver.name } else { "" })
    driverPhone = $(if ($Booking.driverPhone) { $Booking.driverPhone } elseif ($driver) { $driver.phone } else { "" })
    driverVehicle = $(if ($Booking.driverVehicle) { $Booking.driverVehicle } elseif ($driver) { $driver.vehicle } else { "" })
    driverNumberPlate = $(if ($Booking.driverNumberPlate) { $Booking.driverNumberPlate } elseif ($driver) { $driver.numberPlate } else { "" })
    driverVehicleColor = $(if ($Booking.driverVehicleColor) { $Booking.driverVehicleColor } elseif ($driver) { $driver.vehicleColor } else { "" })
    driverPassportPhoto = $(if ($Booking.driverPassportPhoto) { $Booking.driverPassportPhoto } elseif ($driver) { $driver.passportPhoto } else { "" })
    driverLocation = $(if ($Booking.driverLocation) { $Booking.driverLocation } elseif ($driver) { $driver.location } else { $null })
    pickupLocation = $(if ($Booking.pickupLocation) { $Booking.pickupLocation } else { Location-FromText $Booking.pickup })
    tracking = Tracking-For $Booking $driver
    service = $Booking.service
    pickup = $Booking.pickup
    destination = $Booking.destination
    time = $Booking.time
    price = "KES $($Booking.price)"
    status = $Booking.status
    createdAt = $Booking.createdAt
  }
}

function Estimate-Price($Service) {
  if ($Service -eq "taxi") { return 680 }
  if ($Service -eq "boda") { return 210 }
  if ($Service -eq "courier") { return 340 }
  return 250
}

function Location-FromText($Text) {
  $value = "$Text".ToLower()
  if ($value.Contains("westlands")) { return [ordered]@{ lat = -1.2648; lng = 36.8024; label = $Text } }
  if ($value.Contains("kilimani")) { return [ordered]@{ lat = -1.2921; lng = 36.7856; label = $Text } }
  if ($value.Contains("tom mboya")) { return [ordered]@{ lat = -1.2836; lng = 36.8241; label = $Text } }
  if ($value.Contains("cbd") -or $value.Contains("nairobi")) { return [ordered]@{ lat = -1.2864; lng = 36.8172; label = $Text } }
  if ($value.Contains("upper hill")) { return [ordered]@{ lat = -1.3006; lng = 36.8126; label = $Text } }
  if ($value.Contains("industrial area")) { return [ordered]@{ lat = -1.3133; lng = 36.8517; label = $Text } }
  if ($value.Contains("airport") -or $value.Contains("jomo kenyatta")) { return [ordered]@{ lat = -1.3192; lng = 36.9278; label = $Text } }
  $hash = 0
  foreach ($char in $value.ToCharArray()) { $hash += [int][char]$char }
  return [ordered]@{ lat = -1.2864 + ((($hash % 80) - 40) / 1000); lng = 36.8172 + (((($hash * 7) % 80) - 40) / 1000); label = $Text }
}

function Distance-Km($From, $To) {
  if (!$From -or !$To) { return $null }
  $radius = 6371
  $toRad = [Math]::PI / 180
  $dLat = ($To.lat - $From.lat) * $toRad
  $dLng = ($To.lng - $From.lng) * $toRad
  $a = [Math]::Pow([Math]::Sin($dLat / 2), 2) + [Math]::Cos($From.lat * $toRad) * [Math]::Cos($To.lat * $toRad) * [Math]::Pow([Math]::Sin($dLng / 2), 2)
  return $radius * 2 * [Math]::Atan2([Math]::Sqrt($a), [Math]::Sqrt(1 - $a))
}

function Tracking-For($Booking, $Driver) {
  if (!$Driver -or !$Booking.pickupLocation -or $Booking.status -notin @("accepted", "in-progress")) { return $null }
  $driverLocation = $(if ($Booking.driverLocation) { $Booking.driverLocation } else { $Driver.location })
  $km = Distance-Km $driverLocation $Booking.pickupLocation
  if ($null -eq $km) { return $null }
  $speed = $(if ($Booking.service -eq "boda") { 26 } elseif ($Booking.service -eq "courier") { 22 } else { 18 })
  $minutes = [Math]::Max(2, [Math]::Ceiling(($km / $speed) * 60))
  $progress = [Math]::Max(8, [Math]::Min(92, 100 - (($km / 8) * 100)))
  return [ordered]@{ distanceKm = [Math]::Round($km, 1); etaMinutes = $minutes; driverLocation = $driverLocation; pickupLocation = $Booking.pickupLocation; progress = [Math]::Round($progress, 0); updatedAt = $(if ($Booking.locationUpdatedAt) { $Booking.locationUpdatedAt } else { (Get-Date).ToString("o") }) }
}

function Add-ArrayItem($Array, $Item, [switch]$First) {
  $list = New-Object System.Collections.ArrayList
  if ($First) { [void]$list.Add($Item) }
  foreach ($entry in @($Array)) { [void]$list.Add($entry) }
  if (!$First) { [void]$list.Add($Item) }
  return @($list)
}

Ensure-Db
$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Quick App running at http://localhost:$Port"

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $request = $context.Request
  $response = $context.Response
  $path = $request.Url.AbsolutePath
  $method = $request.HttpMethod

  try {
    if ($method -eq "OPTIONS") {
      Send-Json $response 204 ([ordered]@{})
      continue
    }

    if ($path.StartsWith("/api/")) {
      $db = Read-Db

      if ($method -eq "GET" -and $path -eq "/api/health") {
        $active = @($db.bookings | Where-Object { $_.status -notin @("completed", "cancelled") }).Count
        Send-Json $response 200 ([ordered]@{ ok = $true; activeBookings = $active })
        continue
      }

      if ($method -eq "POST" -and $path -eq "/api/auth/login") {
        $body = Read-Body $request
        if ($body.role -eq "customer") {
          if (!$body.email -or !$body.phone) { Send-Json $response 400 ([ordered]@{ error = "Email and phone number are required for customers." }); continue }
          $user = @($db.users | Where-Object { $_.email -eq $body.email -and $_.role -eq "customer" })[0]
          if (!$user -and @($db.users | Where-Object { $_.email -eq $body.email }).Count -gt 0) { Send-Json $response 409 ([ordered]@{ error = "That email belongs to a staff account. Use driver or admin login." }); continue }
          if (!$user) {
            $user = [ordered]@{ id = "u-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"; name = $body.email.Split("@")[0]; email = $body.email; phone = $body.phone; password = ""; role = "customer" }
            $db.users = Add-ArrayItem $db.users $user
            $user = [pscustomobject]$user
          } else {
            $user.phone = $body.phone
          }
          $token = New-Token
          $db.sessions | Add-Member -NotePropertyName $token -NotePropertyValue $user.id -Force
          Write-Db $db
          Send-Json $response 200 ([ordered]@{ token = $token; user = Public-User $user })
          continue
        }
        $user = @($db.users | Where-Object { $_.email -eq $body.email -and $_.password -eq $body.password -and $_.role -eq $body.role })[0]
        if (!$user) { Send-Json $response 401 ([ordered]@{ error = "Invalid email or password." }); continue }
        if ($user.role -eq "driver" -and !$user.approved) { Send-Json $response 403 ([ordered]@{ error = "Your driver account is waiting for admin approval." }); continue }
        $token = New-Token
        $db.sessions | Add-Member -NotePropertyName $token -NotePropertyValue $user.id -Force
        Write-Db $db
        Send-Json $response 200 ([ordered]@{ token = $token; user = Public-User $user })
        continue
      }

      if ($method -eq "POST" -and $path -eq "/api/auth/register") {
        $body = Read-Body $request
        if (!$body.name -or !$body.email -or !$body.phone) { Send-Json $response 400 ([ordered]@{ error = "Name, email, and phone number are required." }); continue }
        if ($body.role -eq "driver" -and !$body.password) { Send-Json $response 400 ([ordered]@{ error = "Drivers need a password." }); continue }
        if (@($db.users | Where-Object { $_.email -eq $body.email }).Count -gt 0) { Send-Json $response 409 ([ordered]@{ error = "Email is already registered." }); continue }
        $role = $(if ($body.role -eq "driver") { "driver" } else { "customer" })
        $isDriver = $role -eq "driver"
        $user = [ordered]@{ id = "u-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"; name = $body.name; email = $body.email; phone = $body.phone; password = $(if ($body.password) { $body.password } else { "" }); role = $role; vehicle = $(if ($isDriver) { $body.vehicle } else { $null }); approved = !$isDriver }
        $db.users = Add-ArrayItem $db.users $user
        if ($isDriver) {
          Write-Db $db
          Send-Json $response 201 ([ordered]@{ user = Public-User ([pscustomobject]$user); message = "Driver registration submitted. Wait for admin approval before logging in." })
          continue
        }
        $token = New-Token
        $db.sessions | Add-Member -NotePropertyName $token -NotePropertyValue $user.id -Force
        Write-Db $db
        Send-Json $response 201 ([ordered]@{ token = $token; user = Public-User ([pscustomobject]$user) })
        continue
      }

      if ($method -eq "POST" -and $path -eq "/api/drivers/register") {
        $body = Read-Body $request
        if (!$body.name -or !$body.idNumber -or !$body.email -or !$body.phone -or !$body.password -or !$body.vehicle -or !$body.numberPlate -or !$body.vehicleColor -or !$body.passportPhoto) { Send-Json $response 400 ([ordered]@{ error = "Name, ID number, email, phone, passport photo, vehicle type, number plate, color, and password are required." }); continue }
        if (@($db.users | Where-Object { $_.email -eq $body.email }).Count -gt 0) { Send-Json $response 409 ([ordered]@{ error = "Email is already registered." }); continue }
        $user = [ordered]@{ id = "u-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"; name = $body.name; idNumber = $body.idNumber; email = $body.email; phone = $body.phone; password = $body.password; role = "driver"; vehicle = $body.vehicle; numberPlate = $body.numberPlate; vehicleColor = $body.vehicleColor; passportPhoto = $body.passportPhoto; location = (Location-FromText $(if ($body.location) { $body.location } else { "Westlands" })); approved = $false; createdAt = (Get-Date).ToString("o") }
        $db.users = Add-ArrayItem $db.users $user
        Write-Db $db
        Send-Json $response 201 ([ordered]@{ user = Public-User ([pscustomobject]$user); message = "Driver registration submitted. Wait for admin approval before logging in." })
        continue
      }

      $user = Get-AuthUser $request $db
      if (!$user) { Send-Json $response 401 ([ordered]@{ error = "Please login first." }); continue }

      if ($method -eq "GET" -and $path -eq "/api/bookings") {
        $items = if ($user.role -eq "admin") { @($db.bookings) } else { @($db.bookings | Where-Object { $_.customerId -eq $user.id }) }
        Send-Json $response 200 ([ordered]@{ bookings = @($items | ForEach-Object { Enrich-Booking $db $_ }) })
        continue
      }

      if ($method -eq "POST" -and $path -eq "/api/bookings") {
        if ($user.role -notin @("customer", "admin")) { Send-Json $response 403 ([ordered]@{ error = "You do not have access to this area." }); continue }
        $body = Read-Body $request
        if (!$body.pickup -or !$body.destination -or !$body.service) { Send-Json $response 400 ([ordered]@{ error = "Pickup, destination, and service are required." }); continue }
        if (!$body.fareApproved) { Send-Json $response 400 ([ordered]@{ error = "Approve the cash fare before searching for a rider." }); continue }
        $approvedFare = $(if ($body.quotedFare) { [int]$body.quotedFare } else { Estimate-Price $body.service })
        $booking = [ordered]@{
          id = "BK-$(([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()).Substring(7))"
          customerId = $user.id
          customerName = $user.name
          customerEmail = $user.email
          customerPhone = $(if ($user.phone) { $user.phone } else { "" })
          driverId = $null
          driverName = ""
          driverPhone = ""
          driverVehicle = ""
          driverNumberPlate = ""
          driverVehicleColor = ""
          driverPassportPhoto = ""
          service = $body.service
          pickup = $body.pickup
          pickupLocation = Location-FromText $body.pickup
          destination = $body.destination
          time = $(if ($body.time) { $body.time } else { "Now" })
          price = $approvedFare
          paymentMethod = "cash"
          fareApproved = $true
          dispatchStatus = "searching-nearest-rider"
          status = "pending"
          createdAt = (Get-Date).ToString("o")
        }
        $db.bookings = Add-ArrayItem $db.bookings $booking -First
        Write-Db $db
        Send-Json $response 201 ([ordered]@{ booking = Enrich-Booking $db ([pscustomobject]$booking) })
        continue
      }

      if ($method -eq "GET" -and $path -eq "/api/driver/jobs") {
        if ($user.role -notin @("driver", "admin")) { Send-Json $response 403 ([ordered]@{ error = "You do not have access to this area." }); continue }
        if ($user.role -eq "driver" -and !$user.approved) { Send-Json $response 403 ([ordered]@{ error = "Your driver account is waiting for admin approval." }); continue }
        $items = @($db.bookings | Where-Object { $_.status -eq "pending" -or $_.driverId -eq $user.id -or $user.role -eq "admin" })
        Send-Json $response 200 ([ordered]@{ bookings = @($items | ForEach-Object { Enrich-Booking $db $_ }) })
        continue
      }

      if ($method -eq "PATCH" -and $path -match "^/api/bookings/([^/]+)/status$") {
        if ($user.role -notin @("driver", "admin")) { Send-Json $response 403 ([ordered]@{ error = "You do not have access to this area." }); continue }
        if ($user.role -eq "driver" -and !$user.approved) { Send-Json $response 403 ([ordered]@{ error = "Your driver account is waiting for admin approval." }); continue }
        $id = $Matches[1]
        $body = Read-Body $request
        if ($body.status -notin @("accepted", "in-progress", "completed", "cancelled")) { Send-Json $response 400 ([ordered]@{ error = "Unsupported status." }); continue }
        $booking = @($db.bookings | Where-Object { $_.id -eq $id })[0]
        if (!$booking) { Send-Json $response 404 ([ordered]@{ error = "Booking not found." }); continue }
        if ($user.role -eq "driver" -and $booking.driverId -and $booking.driverId -ne $user.id) { Send-Json $response 403 ([ordered]@{ error = "This job is assigned to another driver." }); continue }
        if ($user.role -eq "driver" -and $body.status -eq "accepted") { $booking.driverId = $user.id; $booking.driverName = $user.name; $booking.driverPhone = $(if ($user.phone) { $user.phone } else { "" }); $booking.driverVehicle = $(if ($user.vehicle) { $user.vehicle } else { "" }); $booking.driverNumberPlate = $(if ($user.numberPlate) { $user.numberPlate } else { "" }); $booking.driverVehicleColor = $(if ($user.vehicleColor) { $user.vehicleColor } else { "" }); $booking.driverPassportPhoto = $(if ($user.passportPhoto) { $user.passportPhoto } else { "" }); $booking.driverLocation = $(if ($user.location) { $user.location } else { Location-FromText "Westlands" }); $booking.locationUpdatedAt = (Get-Date).ToString("o") }
        if ($user.role -eq "admin" -and $body.status -eq "accepted" -and !$booking.driverId) {
          $driver = @($db.users | Where-Object { $_.role -eq "driver" -and $_.approved })[0]
          if ($driver) { $booking.driverId = $driver.id; $booking.driverName = $driver.name; $booking.driverPhone = $(if ($driver.phone) { $driver.phone } else { "" }); $booking.driverVehicle = $(if ($driver.vehicle) { $driver.vehicle } else { "" }); $booking.driverNumberPlate = $(if ($driver.numberPlate) { $driver.numberPlate } else { "" }); $booking.driverVehicleColor = $(if ($driver.vehicleColor) { $driver.vehicleColor } else { "" }); $booking.driverPassportPhoto = $(if ($driver.passportPhoto) { $driver.passportPhoto } else { "" }); $booking.driverLocation = $(if ($driver.location) { $driver.location } else { Location-FromText "Westlands" }); $booking.locationUpdatedAt = (Get-Date).ToString("o") }
        }
        $booking.status = $body.status
        Write-Db $db
        Send-Json $response 200 ([ordered]@{ booking = Enrich-Booking $db $booking })
        continue
      }

      if ($method -eq "GET" -and $path -eq "/api/admin/summary") {
        if ($user.role -ne "admin") { Send-Json $response 403 ([ordered]@{ error = "You do not have access to this area." }); continue }
        $completed = @($db.bookings | Where-Object { $_.status -eq "completed" })
        $revenue = 0
        foreach ($booking in $completed) { $revenue += [int]$booking.price }
        $metrics = [ordered]@{
          users = @($db.users).Count
          drivers = @($db.users | Where-Object { $_.role -eq "driver" -and $_.approved }).Count
          pendingDrivers = @($db.users | Where-Object { $_.role -eq "driver" -and !$_.approved }).Count
          bookings = @($db.bookings).Count
          revenue = $revenue
        }
        Send-Json $response 200 ([ordered]@{ metrics = $metrics; drivers = @($db.users | Where-Object { $_.role -eq "driver" } | ForEach-Object { Public-User $_ }); bookings = @($db.bookings | ForEach-Object { Enrich-Booking $db $_ }) })
        continue
      }

      if ($method -eq "PATCH" -and $path -match "^/api/admin/drivers/([^/]+)/approve$") {
        if ($user.role -ne "admin") { Send-Json $response 403 ([ordered]@{ error = "You do not have access to this area." }); continue }
        $driver = @($db.users | Where-Object { $_.id -eq $Matches[1] -and $_.role -eq "driver" })[0]
        if (!$driver) { Send-Json $response 404 ([ordered]@{ error = "Driver not found." }); continue }
        $driver.approved = $true
        if (-not ($driver.PSObject.Properties.Name -contains "approvedAt")) { $driver | Add-Member -NotePropertyName approvedAt -NotePropertyValue (Get-Date).ToString("o") } else { $driver.approvedAt = (Get-Date).ToString("o") }
        if (-not ($driver.PSObject.Properties.Name -contains "approvedBy")) { $driver | Add-Member -NotePropertyName approvedBy -NotePropertyValue $user.id } else { $driver.approvedBy = $user.id }
        Write-Db $db
        Send-Json $response 200 ([ordered]@{ driver = Public-User $driver })
        continue
      }

      Send-Json $response 404 ([ordered]@{ error = "API route not found." })
      continue
    }

    $relative = if ($path -eq "/") { "index.html" } else { $path.TrimStart("/") }
    $file = Join-Path $Root $relative
    $resolved = [IO.Path]::GetFullPath($file)
    if (!$resolved.StartsWith($Root)) { $response.StatusCode = 403; $response.Close(); continue }
    if (!(Test-Path $resolved -PathType Leaf)) { $response.StatusCode = 404; $response.Close(); continue }
    $ext = [IO.Path]::GetExtension($resolved)
    $types = @{ ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"; ".js" = "application/javascript; charset=utf-8"; ".json" = "application/json; charset=utf-8" }
    $bytes = [IO.File]::ReadAllBytes($resolved)
    $response.ContentType = $(if ($types[$ext]) { $types[$ext] } else { "application/octet-stream" })
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.Close()
  } catch {
    Send-Json $response 500 ([ordered]@{ error = $_.Exception.Message })
  }
}
