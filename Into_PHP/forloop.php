<!doctype html>
<?php
$terms = array ("JERJER", "ESMERINGHOY", "ASPIKIKAY"); 
 ?>
<html lang="en">
  <head>
    <!-- Required meta tags -->
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <link href="https://cdn.jsdelivr.net/npm/bootstrap@6.0.0-alpha.1/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-B/GM4XqrwHnWXNOWMbloTmrYXZg10cakYGmpfsR/bbzQ6JAJI4ihuyADKLnBgrCe" crossorigin="anonymous">

    <title>Hello, world!</title>
  </head>

  <body data-bs-theme="dark">

    <div class="container p-5">
    <?php for($i = 0; $i < count($terms); $i++) { ?>
        <div class="row">
            <div class="col-12 p-5">
                <div class="card p-5">
                    <div class="h4"><?php echo $terms[$i]; ?></div>
                </div>
            </div>
    </div>
    <?php } ?>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/js/bootstrap.bundle.min.js" integrity="sha384-MrcW6ZMFYlzcLA8Nl+NtUVF0sA7MsXsP1UyJoMp4YLEuNSfAP+JcXn/tWtIaxVXM" crossorigin="anonymous"></script>


    
  </body>
</html>